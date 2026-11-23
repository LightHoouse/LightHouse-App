using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Forms;

class Bridge {
  static JavaScriptSerializer Json = new JavaScriptSerializer();
  delegate bool EnumProc(IntPtr h, IntPtr p);
  delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct Point {public int x,y;}
  [StructLayout(LayoutKind.Sequential)] struct MouseData {public Point point;public uint mouseData,flags,time;public UIntPtr extra;}
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,HookProc cb,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h,int code,IntPtr m,IntPtr data);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  static IntPtr Window,Hook;
  static HookProc Callback=OnMouse;
  static HookProc KeyCallback=OnKey;
  static bool ShortcutDown;
  static Queue<Tuple<int,MouseData,IntPtr>> Pending=new Queue<Tuple<int,MouseData,IntPtr>>();
  static bool RecordAll;
  static long LastClick,LastTyped;
  static string LastTarget="";
  static string Title(IntPtr h){var b=new StringBuilder(512);GetWindowText(h,b,b.Capacity);return b.ToString();}
  static string ProcessName(IntPtr h){uint p;GetWindowThreadProcessId(h,out p);return Process.GetProcessById((int)p).ProcessName;}
  static void Write(object value){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}
  static bool Allowed(IntPtr h){try{string p=ProcessName(h);return h!=IntPtr.Zero && IsWindowVisible(h) && p!="Lighthouse" && p!="electron" && p!="LighthouseBridge";}catch{return false;}}
  static bool InWindow(AutomationElement e) {
    for(int i=0;e!=null && i<40;i++,e=TreeWalker.RawViewWalker.GetParent(e))
      if(e.Current.NativeWindowHandle==Window.ToInt32())return true;
    return false;
  }
  static Dictionary<string,object> Target(AutomationElement e) {
    var c=e.Current;if(c.IsPassword)throw new Exception("Protected field");
    var name=c.ControlType==ControlType.Edit?"":c.Name;
    return new Dictionary<string,object>{{"automationId",c.AutomationId??""},{"name",(name??"").Substring(0,Math.Min(300,(name??"").Length))},{"controlType",c.ControlType.ProgrammaticName.Replace("ControlType.","")}};
  }
  static void Emit(string kind,AutomationElement e,string direction) {
    if(e==null || !InWindow(e))return;
    var t=Target(e); if((string)t["automationId"]=="" && (string)t["name"]=="")return;
    var now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    if(kind=="click") {
      string signature=ProcessName(Window)+Json.Serialize(t);
      if(now-LastClick<SystemInformation.DoubleClickTime && signature==LastTarget)kind="doubleClick";
      LastClick=now;LastTarget=signature;
    }
    string title=Title(Window);if(title.Length>300)title=title.Substring(0,300);
    var row=new Dictionary<string,object>{{"eventId",Guid.NewGuid().ToString()},{"event",kind},{"target",t},{"window",new {process=ProcessName(Window),title=title}},{"timestamp",now}};
    if(direction!=null)row["direction"]=direction;
    Write(new {kind="step",step=row});
  }
  static IntPtr OnMouse(int code,IntPtr message,IntPtr data) {
    int m=message.ToInt32();
    if(code>=0 && (m==0x201 || m==0x204 || m==0x20A)) {
      var value=(MouseData)Marshal.PtrToStructure(data,typeof(MouseData));
      var root=GetAncestor(WindowFromPoint(value.point),2);
      if(Pending.Count<200 && (RecordAll?Allowed(root):root==Window))Pending.Enqueue(Tuple.Create(m,value,root));
    }
    return CallNextHookEx(Hook,code,message,data);
  }
  static IntPtr OnKey(int code,IntPtr message,IntPtr data) {
    if(code>=0 && Marshal.ReadInt32(data)==0x4C) {
      int m=message.ToInt32();
      if((m==0x100 || m==0x104) && (GetAsyncKeyState(0x12)&0x8000)!=0) {
        if(!ShortcutDown){ShortcutDown=true;var h=GetForegroundWindow();Write(new {kind="hotkey",context=Allowed(h)?new {handle=h.ToInt64().ToString(),title=Title(h),process=ProcessName(h)}:null});}
        return new IntPtr(1);
      }
      if((m==0x101 || m==0x105) && ShortcutDown){ShortcutDown=false;return new IntPtr(1);}
    }
    return CallNextHookEx(Hook,code,message,data);
  }
  static void Record() {
    Hook=SetWindowsHookEx(14,Callback,GetModuleHandle(null),0);
    if(Hook==IntPtr.Zero)throw new Exception("Cannot start recorder");
    var timer=new System.Windows.Forms.Timer();timer.Interval=30;
    timer.Tick+=(s,a)=>{
      try {
        while(Pending.Count>0) {
          var item=Pending.Dequeue();var p=item.Item2.point;if(RecordAll)Window=item.Item3;
          var element=AutomationElement.FromPoint(new System.Windows.Point(p.x,p.y));
          Emit(item.Item1==0x20A?"scroll":item.Item1==0x204?"rightClick":"click",element,item.Item1==0x20A?((short)(item.Item2.mouseData>>16)>0?"up":"down"):null);
        }
        var foreground=GetForegroundWindow();
        if(RecordAll?Allowed(foreground):foreground==Window) {
          if(RecordAll)Window=foreground;
          bool typed=false;for(int k=0x30;k<=0x5A;k++)if((k<=0x39 || k>=0x41) && (GetAsyncKeyState(k)&0x8000)!=0)typed=true;
          if((GetAsyncKeyState(8)&0x8000)!=0 || (GetAsyncKeyState(32)&0x8000)!=0)typed=true;
          long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
          if(typed){var focused=AutomationElement.FocusedElement;if(now-LastTyped>800 && focused!=null && (focused.Current.ControlType==ControlType.Edit || focused.Current.ControlType==ControlType.ComboBox || focused.Current.ControlType==ControlType.Document))Emit("type",focused,null);LastTyped=now;}
        }
      } catch { /* An element may disappear while an application changes screens. */ }
    };
    timer.Start();Write(new {kind="ready"});
    Application.Run();UnhookWindowsHookEx(Hook);
  }
  static AutomationElement Locate(Dictionary<string,string> t,out string strategy) {
    var root=AutomationElement.FromHandle(Window);
    var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);
    var ids=new List<AutomationElement>();var names=new List<AutomationElement>();
    foreach(AutomationElement e in all) {
      try {
        var c=e.Current;if(c.IsOffscreen || c.IsPassword || c.ControlType.ProgrammaticName!="ControlType."+t["controlType"])continue;
        if(t["automationId"]!="" && c.AutomationId==t["automationId"])ids.Add(e);
        if(t["name"]!="" && c.Name==t["name"])names.Add(e);
      } catch {}
    }
    AutomationElement found=null;strategy=null;
    if(ids.Count==1){found=ids[0];strategy="automationId";}
    else if(ids.Count==0 && names.Count==1){found=names[0];strategy="role-name";}
    return found;
  }
  static Dictionary<string,string> DecodeTarget(string data){return Json.Deserialize<Dictionary<string,string>>(Encoding.UTF8.GetString(Convert.FromBase64String(data)));}
  static void Resolve(string data){
    string strategy;var found=Locate(DecodeTarget(data),out strategy);
    if(found==null){Write(new {resolved=false,reason="Target tidak terlihat atau ambigu."});return;}
    var r=found.Current.BoundingRectangle;
    Write(new {resolved=true,strategy=strategy,bounds=new {x=r.X,y=r.Y,width=r.Width,height=r.Height}});
  }
  static void Watch(string data,string action){
    var target=DecodeTarget(data);string strategy;var element=Locate(target,out strategy);
    if(element==null)throw new Exception("Target missing");
    var bounds=element.Current.BoundingRectangle;
    Hook=SetWindowsHookEx(14,Callback,GetModuleHandle(null),0);
    if(Hook==IntPtr.Zero)throw new Exception("Mouse observer unavailable");
    var timer=new System.Windows.Forms.Timer();timer.Interval=100;int misses=0;
    timer.Tick+=(s,a)=>{
      try{
        while(Pending.Count>0){var item=Pending.Dequeue();var p=item.Item2.point;
          if(item.Item1==(action=="rightClick"?0x204:0x201)&&bounds.Contains(p.x,p.y)){
            Write(new {kind="target-clicked"});Application.ExitThread();return;
          }
        }
        if(!IsWindowVisible(Window)){Write(new {kind="target-lost"});Application.ExitThread();return;}
        element=Locate(target,out strategy);
        if(element==null){if(++misses>=10){Write(new {kind="target-lost"});Application.ExitThread();}return;}
        misses=0;bounds=element.Current.BoundingRectangle;
        Write(new {kind="target-position",bounds=new {x=bounds.X,y=bounds.Y,width=bounds.Width,height=bounds.Height}});
      }catch{if(++misses>=10){Write(new {kind="target-lost"});Application.ExitThread();}}
    };
    timer.Start();Write(new {kind="ready"});Application.Run();timer.Stop();UnhookWindowsHookEx(Hook);
  }
  [STAThread] static void Main(string[] args) {
    Console.OutputEncoding=new UTF8Encoding(false);SetProcessDPIAware();
    try {
      if(args.Length==0)return;
      if(args[0]=="hotkey") {Hook=SetWindowsHookEx(13,KeyCallback,GetModuleHandle(null),0);if(Hook==IntPtr.Zero)throw new Exception("Hotkey unavailable");Write(new {kind="ready"});Application.Run();UnhookWindowsHookEx(Hook);return;}
      if(args[0]=="foreground") {var h=GetForegroundWindow();Write(Allowed(h)?new {handle=h.ToInt64().ToString(),title=Title(h),process=ProcessName(h)}:null);return;}
      if(args[0]=="record-all") {RecordAll=true;Record();return;}
      if(args[0]=="windows") {
        var rows=new List<object>();
        EnumWindows((h,p)=>{try{string title=Title(h),process=ProcessName(h);if(IsWindowVisible(h) && title!="" && process!="Lighthouse" && process!="electron") rows.Add(new {handle=h.ToInt64().ToString(),title=title,process=process});}catch{}return true;},IntPtr.Zero);
        Write(rows);return;
      }
      Window=new IntPtr(long.Parse(args[1]));
      if(!IsWindowVisible(Window))throw new Exception("Selected window is unavailable");
      if(args[0]=="record")Record();
      else if(args[0]=="resolve")Resolve(args[2]);
      else if(args[0]=="watch")Watch(args[2],args.Length>3?args[3]:"click");
      else if(args[0]=="snapshot") {
        var names=new List<string>();var root=AutomationElement.FromHandle(Window);
        foreach(AutomationElement e in root.FindAll(TreeScope.Descendants,Condition.TrueCondition)) {
          try {var c=e.Current;if(!c.IsPassword && !c.IsOffscreen && c.ControlType!=ControlType.Edit && !String.IsNullOrEmpty(c.Name) && c.Name.Length<=300 && !names.Contains(c.Name))names.Add(c.Name);if(names.Count>=100)break;}catch{}
        }
        Write(new {visibleNames=names});
      }
    } catch {Write(new {kind="error",error="Jendela tidak dapat dibaca. Pilih ulang jendela aplikasi yang didukung."});Environment.ExitCode=1;}
  }
}

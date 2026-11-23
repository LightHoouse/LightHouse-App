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
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,HookProc cb,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h,int code,IntPtr m,IntPtr data);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  static IntPtr Window,Hook;
  static HookProc Callback=OnMouse;
  static Queue<Tuple<int,MouseData>> Pending=new Queue<Tuple<int,MouseData>>();
  static long LastClick,LastTyped;
  static string LastTarget="";
  static string Title(IntPtr h){var b=new StringBuilder(512);GetWindowText(h,b,b.Capacity);return b.ToString();}
  static string ProcessName(IntPtr h){uint p;GetWindowThreadProcessId(h,out p);return Process.GetProcessById((int)p).ProcessName;}
  static void Write(object value){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}
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
      string signature=Json.Serialize(t);
      if(now-LastClick<SystemInformation.DoubleClickTime && signature==LastTarget)kind="doubleClick";
      LastClick=now;LastTarget=signature;
    }
    var row=new Dictionary<string,object>{{"eventId",Guid.NewGuid().ToString()},{"event",kind},{"target",t},{"window",new {process=ProcessName(Window),title=Title(Window)}},{"timestamp",now}};
    if(direction!=null)row["direction"]=direction;
    Write(new {kind="step",step=row});
  }
  static IntPtr OnMouse(int code,IntPtr message,IntPtr data) {
    int m=message.ToInt32();
    if(code>=0 && (m==0x201 || m==0x204 || m==0x20A) && GetForegroundWindow()==Window) {
      var value=(MouseData)Marshal.PtrToStructure(data,typeof(MouseData));
      Pending.Enqueue(Tuple.Create(m,value));
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
          var item=Pending.Dequeue();var p=item.Item2.point;
          var element=AutomationElement.FromPoint(new System.Windows.Point(p.x,p.y));
          Emit(item.Item1==0x20A?"scroll":item.Item1==0x204?"rightClick":"click",element,item.Item1==0x20A?((short)(item.Item2.mouseData>>16)>0?"up":"down"):null);
        }
        if(GetForegroundWindow()==Window) {
          bool typed=false;for(int k=0x30;k<=0x5A;k++)if((k<=0x39 || k>=0x41) && (GetAsyncKeyState(k)&0x8000)!=0)typed=true;
          if((GetAsyncKeyState(8)&0x8000)!=0 || (GetAsyncKeyState(32)&0x8000)!=0)typed=true;
          long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
          if(typed){var focused=AutomationElement.FocusedElement;if(now-LastTyped>800 && focused!=null && (focused.Current.ControlType==ControlType.Edit || focused.Current.ControlType==ControlType.ComboBox))Emit("type",focused,null);LastTyped=now;}
        }
      } catch { /* An element may disappear while an application changes screens. */ }
    };
    timer.Start();Write(new {kind="ready"});
    Application.Run();UnhookWindowsHookEx(Hook);
  }
  static void Resolve(string data) {
    var t=Json.Deserialize<Dictionary<string,string>>(Encoding.UTF8.GetString(Convert.FromBase64String(data)));
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
    AutomationElement found=null;string strategy=null;
    if(ids.Count==1){found=ids[0];strategy="automationId";}
    else if(ids.Count==0 && names.Count==1){found=names[0];strategy="role-name";}
    if(found==null){Write(new {resolved=false,reason=(ids.Count>1 || names.Count>1)?"Target ambigu. Buka tampilan yang sesuai.":"Target belum terlihat. Buka tampilan sesuai rekaman."});return;}
    var r=found.Current.BoundingRectangle;
    Write(new {resolved=true,strategy=strategy,bounds=new {x=r.X,y=r.Y,width=r.Width,height=r.Height}});
  }
  [STAThread] static void Main(string[] args) {
    Console.OutputEncoding=new UTF8Encoding(false);SetProcessDPIAware();
    try {
      if(args.Length==0)return;
      if(args[0]=="windows") {
        var rows=new List<object>();
        EnumWindows((h,p)=>{try{string title=Title(h),process=ProcessName(h);if(IsWindowVisible(h) && title!="" && process!="Lighthouse" && process!="electron") rows.Add(new {handle=h.ToInt64().ToString(),title=title,process=process});}catch{}return true;},IntPtr.Zero);
        Write(rows);return;
      }
      Window=new IntPtr(long.Parse(args[1]));
      if(!IsWindowVisible(Window))throw new Exception("Selected window is unavailable");
      if(args[0]=="record")Record();
      else if(args[0]=="resolve")Resolve(args[2]);
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

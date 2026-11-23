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
  static IntPtr Window,Hook,KeyboardHook;
  static HookProc RecordKeyCallback=OnRecordKey;
  static Queue<IntPtr> TypedPending=new Queue<IntPtr>();
  static HookProc Callback=OnMouse;
  static HookProc KeyCallback=OnKey;
  static bool ShortcutDown;
  static Queue<Tuple<int,MouseData,IntPtr>> Pending=new Queue<Tuple<int,MouseData,IntPtr>>();
  static bool RecordAll;
  static volatile bool StopRequested;
  static Dictionary<long,Dictionary<string,object>> Prior=new Dictionary<long,Dictionary<string,object>>();
  static List<Tuple<long,IntPtr,Dictionary<string,object>>> Enrich=new List<Tuple<long,IntPtr,Dictionary<string,object>>>();
  static Dictionary<string,object> State(IntPtr h){
    var names=new List<string>();var elements=new List<object>();
    foreach(AutomationElement e in AutomationElement.FromHandle(h).FindAll(TreeScope.Descendants,Condition.TrueCondition)){
      try{var c=e.Current;if(c.IsOffscreen||c.IsPassword||c.ControlType==ControlType.Edit||c.ControlType==ControlType.Document)continue;
        string name=c.Name??"";if(name.Length>300)continue;if(name!=""&&!names.Contains(name))names.Add(name);
        object value;bool? selected=null,checkedValue=null,expanded=null;
        if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out value))selected=((SelectionItemPattern)value).Current.IsSelected;
        if(e.TryGetCurrentPattern(TogglePattern.Pattern,out value))checkedValue=((TogglePattern)value).Current.ToggleState==ToggleState.On;
        if(e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern,out value))expanded=((ExpandCollapsePattern)value).Current.ExpandCollapseState==ExpandCollapseState.Expanded;
        elements.Add(new {automationId=c.AutomationId??"",role=c.ControlType.ProgrammaticName.Replace("ControlType.",""),name=name,enabled=c.IsEnabled,selected=selected,checkedValue=checkedValue,expanded=expanded});if(elements.Count>=100)break;
      }catch{}
    }
    return new Dictionary<string,object>{{"windowTitle",Title(h)},{"visibleNames",names},{"elements",elements},{"observedAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}};
  }
  static object Details(AutomationElement e){
    var c=e.Current;var r=c.BoundingRectangle;var root=AutomationElement.FromHandle(Window).Current.BoundingRectangle;
    var ancestors=new List<object>();var parent=TreeWalker.ControlViewWalker.GetParent(e);
    for(int i=0;i<5&&parent!=null;i++,parent=TreeWalker.ControlViewWalker.GetParent(parent)){var pc=parent.Current;if(pc.NativeWindowHandle==Window.ToInt32())break;ancestors.Add(new {role=pc.ControlType.ProgrammaticName.Replace("ControlType.",""),name=pc.IsPassword||pc.ControlType==ControlType.Edit?"":pc.Name??""});}
    var patterns=new List<string>();foreach(var pattern in e.GetSupportedPatterns())patterns.Add(pattern.ProgrammaticName);
    string version="";try{uint pid;GetWindowThreadProcessId(Window,out pid);version=Process.GetProcessById((int)pid).MainModule.FileVersionInfo.FileVersion??"";}catch{}
    return new {className=c.ClassName??"",ancestors=ancestors,supportedPatterns=patterns,enabled=c.IsEnabled,bboxNorm=new double[]{root.Width>0?(r.X-root.X)/root.Width:0,root.Height>0?(r.Y-root.Y)/root.Height:0,root.Width>0?r.Width/root.Width:0,root.Height>0?r.Height/root.Height:0},appVersion=version};
  }

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
    Dictionary<string,object> pre;Prior.TryGetValue(Window.ToInt64(),out pre);
    row["capture"]=new Dictionary<string,object>{{"surface","uia"},{"preState",pre},{"postState",null},{"details",Details(e)},{"env",new {os=Environment.OSVersion.ToString(),dpi=(int?)null,resolution=new int[]{Screen.PrimaryScreen.Bounds.Width,Screen.PrimaryScreen.Bounds.Height},monitorCount=Screen.AllScreens.Length,locale=System.Globalization.CultureInfo.CurrentCulture.Name}}};
    Enrich.Add(Tuple.Create(now+400,Window,row));
    if(direction!=null)row["direction"]=direction;
    Write(new {kind="step",step=row});
  }
  static IntPtr OnMouse(int code,IntPtr message,IntPtr data) {
    int m=message.ToInt32();
    if(code>=0 && (m==0x201 || m==0x204 || m==0x20A)) {
      var value=(MouseData)Marshal.PtrToStructure(data,typeof(MouseData));
      var root=GetAncestor(WindowFromPoint(value.point),2);
      if(!StopRequested && Pending.Count<200 && (RecordAll?Allowed(root):root==Window))Pending.Enqueue(Tuple.Create(m,value,root));
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
  static IntPtr OnRecordKey(int code,IntPtr message,IntPtr data){
    if(code>=0&&!StopRequested&&(message.ToInt32()==0x100||message.ToInt32()==0x104)){
      int key=Marshal.ReadInt32(data);var h=GetForegroundWindow();
      if((key==8||key==32||(key>=0x30&&key<=0x5A)||(key>=186&&key<=222))&&(GetAsyncKeyState(17)&0x8000)==0&&(GetAsyncKeyState(18)&0x8000)==0&&(RecordAll?Allowed(h):h==Window)){
        long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if(now-LastTyped>800&&TypedPending.Count<100)TypedPending.Enqueue(h);
        LastTyped=now;
      }
    }
    return CallNextHookEx(KeyboardHook,code,message,data);
  }
  static void Record() {
    Hook=SetWindowsHookEx(14,Callback,GetModuleHandle(null),0);
    KeyboardHook=SetWindowsHookEx(13,RecordKeyCallback,GetModuleHandle(null),0);
    if(Hook==IntPtr.Zero||KeyboardHook==IntPtr.Zero)throw new Exception("Cannot start recorder");
    new Thread(()=>{Console.ReadLine();StopRequested=true;}){IsBackground=true}.Start();
    var timer=new System.Windows.Forms.Timer();timer.Interval=30;long lastSnapshot=0;
    timer.Tick+=(s,a)=>{
      try {
        long tick=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        while(Pending.Count>0) {
          var item=Pending.Dequeue();var p=item.Item2.point;if(RecordAll)Window=item.Item3;
          var element=AutomationElement.FromPoint(new System.Windows.Point(p.x,p.y));
          Emit(item.Item1==0x20A?"scroll":item.Item1==0x204?"rightClick":"click",element,item.Item1==0x20A?((short)(item.Item2.mouseData>>16)>0?"up":"down"):null);
        }
        while(TypedPending.Count>0){
          var h=TypedPending.Dequeue();if(RecordAll)Window=h;
          var focused=AutomationElement.FocusedElement;
          if(focused!=null&&(focused.Current.ControlType==ControlType.Edit||focused.Current.ControlType==ControlType.ComboBox||focused.Current.ControlType==ControlType.Document))Emit("type",focused,null);
        }
        for(int i=Enrich.Count-1;i>=0;i--){var item=Enrich[i];if(tick>=item.Item1||StopRequested){try{((Dictionary<string,object>)item.Item3["capture"])["postState"]=State(item.Item2);Write(new {kind="enrichment",step=item.Item3});}catch{}Enrich.RemoveAt(i);}}
        if(StopRequested){Application.ExitThread();return;}
        var foreground=GetForegroundWindow();
        if(RecordAll?Allowed(foreground):foreground==Window) {
          if(RecordAll)Window=foreground;
          if(tick-lastSnapshot>200){Prior[Window.ToInt64()]=State(Window);lastSnapshot=tick;}

        }
      } catch { /* An element may disappear while an application changes screens. */ }
    };
    timer.Start();Write(new {kind="ready"});
    Application.Run();UnhookWindowsHookEx(Hook);UnhookWindowsHookEx(KeyboardHook);
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
      if(args[0]=="protect"||args[0]=="unprotect"){
        var bytes=Convert.FromBase64String(Console.In.ReadToEnd());
        var result=args[0]=="protect"?System.Security.Cryptography.ProtectedData.Protect(bytes,null,System.Security.Cryptography.DataProtectionScope.CurrentUser):System.Security.Cryptography.ProtectedData.Unprotect(bytes,null,System.Security.Cryptography.DataProtectionScope.CurrentUser);
        Console.Write(Convert.ToBase64String(result));return;
      }
      if(args[0]=="hotkey") {Hook=SetWindowsHookEx(13,KeyCallback,GetModuleHandle(null),0);if(Hook==IntPtr.Zero)throw new Exception("Hotkey unavailable");Write(new {kind="ready"});Application.Run();UnhookWindowsHookEx(Hook);UnhookWindowsHookEx(KeyboardHook);return;}
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
      else if(args[0]=="snapshot") {Write(State(Window));return;

      }
    } catch {Write(new {kind="error",error="Jendela tidak dapat dibaca. Pilih ulang jendela aplikasi yang didukung."});Environment.ExitCode=1;}
  }
}

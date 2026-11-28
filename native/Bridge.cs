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
  // Hook callbacks must never wait for a UI Automation provider. A separate
  // STA consumes these queues while the hook thread keeps pumping messages.
  class InputQueue<T> {
    readonly Queue<T> queue=new Queue<T>();
    public int Count {get {lock(queue)return queue.Count;}}
    public void Enqueue(T item){lock(queue)queue.Enqueue(item);}
    public T Dequeue(){lock(queue)return queue.Dequeue();}
  }
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
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int nCmdShow);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int left,top,right,bottom;}
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach,uint idAttachTo,bool fAttach);
  [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int dwProcessId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
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
  static InputQueue<IntPtr> TypedPending=new InputQueue<IntPtr>();
  static HookProc Callback=OnMouse;
  static HookProc KeyCallback=OnKey;
  static bool ShortcutDown;
  static InputQueue<Tuple<int,MouseData,IntPtr>> Pending=new InputQueue<Tuple<int,MouseData,IntPtr>>();
  static Tuple<int,MouseData,IntPtr> Pressed;
  static bool MouseHeld;
  static long LastMove;
  static List<Point> Stroke=new List<Point>();
  static InputQueue<Tuple<IntPtr,string,string[]>> Shortcuts=new InputQueue<Tuple<IntPtr,string,string[]>>();
  static string[] Modifiers(){var list=new List<string>();if((GetAsyncKeyState(17)&0x8000)!=0)list.Add("Control");if((GetAsyncKeyState(16)&0x8000)!=0)list.Add("Shift");if((GetAsyncKeyState(18)&0x8000)!=0)list.Add("Alt");if((GetAsyncKeyState(32)&0x8000)!=0)list.Add("Space");return list.ToArray();}
  static bool RecordAll;
  static bool HasDisplayBounds;
  static int DisplayX,DisplayY,DisplayW,DisplayH;
  static bool InSelectedDisplay(Point p){return !HasDisplayBounds||(p.x>=DisplayX&&p.x<DisplayX+DisplayW&&p.y>=DisplayY&&p.y<DisplayY+DisplayH);}
  static bool WindowInSelectedDisplay(IntPtr h){if(!HasDisplayBounds)return true;Rect r;if(!GetWindowRect(h,out r))return false;int cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;return cx>=DisplayX&&cx<DisplayX+DisplayW&&cy>=DisplayY&&cy<DisplayY+DisplayH;}
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
    for(int i=0;i<5&&parent!=null;i++,parent=TreeWalker.ControlViewWalker.GetParent(parent)){var pc=parent.Current;if(pc.NativeWindowHandle==Window.ToInt32())break;ancestors.Add(new {role=pc.ControlType.ProgrammaticName.Replace("ControlType.",""),name=pc.IsPassword||pc.ControlType==ControlType.Edit||pc.ControlType==ControlType.Document?"":pc.Name??""});}
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
    var name=c.ControlType==ControlType.Edit||c.ControlType==ControlType.Document?"":c.Name;
    return new Dictionary<string,object>{{"automationId",c.AutomationId??""},{"name",(name??"").Substring(0,Math.Min(300,(name??"").Length))},{"controlType",c.ControlType.ProgrammaticName.Replace("ControlType.","")}};
  }
  static void Emit(string kind,AutomationElement e,string direction,object motion=null,int scrollDelta=0,string key=null,string[] modifiers=null,string button="left") {
    if(e==null || !InWindow(e))return;
    var t=Target(e);
    if((string)t["automationId"]=="" && (string)t["name"]=="" && (string)t["controlType"]=="Document"){t["automationId"]="__document__";t["name"]="Canvas";}
    if((string)t["automationId"]=="" && (string)t["name"]=="")return;
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
    if(motion!=null)row["motion"]=motion;
    row["modifiers"]=modifiers??Modifiers();row["button"]=button;if(key!=null)row["key"]=key;
    if(kind=="scroll")row["scrollDelta"]=new int[]{0,scrollDelta};
    Write(new {kind="step",step=row});
  }
  static IntPtr OnMouse(int code,IntPtr message,IntPtr data) {
    int m=message.ToInt32();
    if(code>=0&&(m==0x201||m==0x207))MouseHeld=true;
    bool move=m==0x200&&MouseHeld&&DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-LastMove>=25;
    if(move)LastMove=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    if(code>=0 && (move || m==0x201 || m==0x202 || m==0x204 || m==0x205 || m==0x207 || m==0x208 || m==0x20A)) {
      var value=(MouseData)Marshal.PtrToStructure(data,typeof(MouseData));
      var root=GetAncestor(WindowFromPoint(value.point),2);
      if(!StopRequested && Pending.Count<200 && (!RecordAll || InSelectedDisplay(value.point)) && (RecordAll?Allowed(root):root==Window))Pending.Enqueue(Tuple.Create(m,value,root));
    }
    if(m==0x202||m==0x208)MouseHeld=false;
    return CallNextHookEx(Hook,code,message,data);
  }
  static IntPtr OnKey(int code,IntPtr message,IntPtr data) {
    if(code>=0 && Marshal.ReadInt32(data)==0x4C) {
      int m=message.ToInt32();
      if((m==0x100 || m==0x104) && (GetAsyncKeyState(0x12)&0x8000)!=0) {
        if(!ShortcutDown){ShortcutDown=true;AllowSetForegroundWindow(-1);var h=GetForegroundWindow();Write(new {kind="hotkey",context=Allowed(h)?new {handle=h.ToInt64().ToString(),title=Title(h),process=ProcessName(h)}:null});}
        return new IntPtr(1);
      }
      if((m==0x101 || m==0x105) && ShortcutDown){ShortcutDown=false;return new IntPtr(1);}
    }
    return CallNextHookEx(Hook,code,message,data);
  }
  static IntPtr OnRecordKey(int code,IntPtr message,IntPtr data){
    if(code>=0&&!StopRequested&&(message.ToInt32()==0x100||message.ToInt32()==0x104)){
      int key=Marshal.ReadInt32(data);var h=GetForegroundWindow();
      if((RecordAll?(Allowed(h)&&WindowInSelectedDisplay(h)):h==Window)&&Shortcuts.Count<50){
        bool command=(GetAsyncKeyState(17)&0x8000)!=0||(GetAsyncKeyState(18)&0x8000)!=0;
        bool ownShortcut=(GetAsyncKeyState(18)&0x8000)!=0&&(key==71||key==72||key==76||((GetAsyncKeyState(16)&0x8000)!=0&&(key==82||key==83||key==79||key==75)));
        string keyName=key==46?"Delete":key==27?"Escape":key==9?"Tab":key==13?"Enter":key>=112&&key<=123?"F"+(key-111):command&&key>=65&&key<=90?((char)key).ToString():null;
        if(!ownShortcut&&keyName!=null)Shortcuts.Enqueue(Tuple.Create(h,keyName,Modifiers()));
      }
      if((key==8||key==32||(key>=0x30&&key<=0x5A)||(key>=186&&key<=222))&&(GetAsyncKeyState(17)&0x8000)==0&&(GetAsyncKeyState(18)&0x8000)==0&&(RecordAll?(Allowed(h)&&WindowInSelectedDisplay(h)):h==Window)){
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
    var worker=new Thread(()=>{
    var timer=new System.Windows.Forms.Timer();timer.Interval=30;long lastSnapshot=0;
    timer.Tick+=(s,a)=>{
      try {
        long tick=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        while(Pending.Count>0) {
          var item=Pending.Dequeue();
          if(item.Item1==0x201||item.Item1==0x204||item.Item1==0x207){Pressed=item;Stroke.Clear();Stroke.Add(item.Item2.point);continue;}
          if(item.Item1==0x200){if(Pressed!=null&&Stroke.Count<255)Stroke.Add(item.Item2.point);continue;}
          var finish=item.Item2.point;bool drag=false;int message=item.Item1;
          if(message==0x202||message==0x205||message==0x208){if(Pressed==null)continue;var down=Pressed;Pressed=null;if(down.Item3!=item.Item3)continue;drag=(message==0x202||message==0x208)&&(Math.Abs(finish.x-down.Item2.point.x)+Math.Abs(finish.y-down.Item2.point.y)>8||Stroke.Exists(pt=>Math.Abs(pt.x-down.Item2.point.x)+Math.Abs(pt.y-down.Item2.point.y)>8));item=down;}
          var p=item.Item2.point;if(RecordAll)Window=item.Item3;
          var element=AutomationElement.FromPoint(new System.Windows.Point(p.x,p.y));
          // FromPoint may see a newly appeared overlay; resolve in the actual event window.
          if(element==null||!InWindow(element)){
            element=null;double area=Double.MaxValue;
            foreach(AutomationElement candidate in AutomationElement.FromHandle(Window).FindAll(TreeScope.Descendants,Condition.TrueCondition)){
              try{var c=candidate.Current;var b=c.BoundingRectangle;if(!c.IsOffscreen&&!c.IsPassword&&b.Contains(p.x,p.y)&&b.Width*b.Height<area){element=candidate;area=b.Width*b.Height;}}catch{}
            }
          }
          object motion=null;
          // WinUI toolbar icons can be unnamed Image children of a named
          // Button. Preserve the actionable ancestor instead of dropping clicks.
          while(element!=null&&InWindow(element)&&element.Current.AutomationId==""&&element.Current.Name==""&&element.Current.ControlType!=ControlType.Edit&&element.Current.ControlType!=ControlType.Document)
            element=TreeWalker.ControlViewWalker.GetParent(element);
          if(drag){
            Stroke.Add(finish);
            while(element!=null&&(!Stroke.TrueForAll(pt=>element.Current.BoundingRectangle.Contains(pt.x,pt.y))||(element.Current.AutomationId==""&&element.Current.Name==""&&element.Current.ControlType!=ControlType.Document)))element=TreeWalker.ControlViewWalker.GetParent(element);
            if(element==null||!InWindow(element))continue;var b=element.Current.BoundingRectangle;if(b.Width<=0||b.Height<=0)continue;
            var points=new List<double[]>();foreach(var pt in Stroke)points.Add(new double[]{(pt.x-b.X)/b.Width,(pt.y-b.Y)/b.Height});
            motion=new {points=points,start=new double[]{(p.x-b.X)/b.Width,(p.y-b.Y)/b.Height},end=new double[]{(finish.x-b.X)/b.Width,(finish.y-b.Y)/b.Height}};
          }
          if(message==0x20A){var container=element;while(container!=null&&InWindow(container)){object pattern;if(container.TryGetCurrentPattern(ScrollPattern.Pattern,out pattern)){element=container;break;}container=TreeWalker.ControlViewWalker.GetParent(container);}}
          Emit(drag?"dragDrop":item.Item1==0x20A?"scroll":item.Item1==0x204?"rightClick":"click",element,item.Item1==0x20A?((short)(item.Item2.mouseData>>16)>0?"up":"down"):null,motion,item.Item1==0x20A?(short)(item.Item2.mouseData>>16):0,null,null,item.Item1==0x207?"middle":item.Item1==0x204?"right":"left");
        }
        while(Shortcuts.Count>0){var command=Shortcuts.Dequeue();if(RecordAll)Window=command.Item1;var focused=AutomationElement.FocusedElement;if(focused!=null&&InWindow(focused))Emit("keypress",focused,null,null,0,command.Item2,command.Item3);}
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
    timer.Start();Application.Run();timer.Stop();
    }){IsBackground=true};worker.SetApartmentState(ApartmentState.STA);worker.Start();
    var shutdown=new System.Windows.Forms.Timer();shutdown.Interval=50;
    shutdown.Tick+=(s,a)=>{if(StopRequested&&!worker.IsAlive)Application.ExitThread();};shutdown.Start();
    Write(new {kind="ready"});
    Application.Run();shutdown.Stop();UnhookWindowsHookEx(Hook);UnhookWindowsHookEx(KeyboardHook);
  }
  static AutomationElement Locate(Dictionary<string,string> t,out string strategy) {
    var root=AutomationElement.FromHandle(Window);
    var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);
    if(t["automationId"]=="__document__" && t["controlType"]=="Document") {
      AutomationElement best=null;double bestArea=0;
      foreach(AutomationElement e in all) {
        try {
          var c=e.Current;if(c.IsOffscreen || c.IsPassword || c.ControlType!=ControlType.Document)continue;
          var b=c.BoundingRectangle;double area=b.Width*b.Height;
          if(b.Width>0 && b.Height>0 && area>bestArea){best=e;bestArea=area;}
        } catch {}
      }
      strategy=best!=null?"document-viewport":null;
      return best;
    }
    var ids=new List<AutomationElement>();var names=new List<AutomationElement>();var anyTypeNames=new List<AutomationElement>();
    AutomationElement bestDoc=null;double bestDocArea=0;
    foreach(AutomationElement e in all) {
      try {
        var c=e.Current;if(c.IsOffscreen || c.IsPassword)continue;
        if(c.ControlType==ControlType.Document){var db=c.BoundingRectangle;double da=db.Width*db.Height;if(db.Width>0&&db.Height>0&&da>bestDocArea){bestDoc=e;bestDocArea=da;}}
        if(t["name"]!="" && c.Name==t["name"])anyTypeNames.Add(e);
        if(c.ControlType.ProgrammaticName!="ControlType."+t["controlType"])continue;
        if(t["automationId"]!="" && c.AutomationId==t["automationId"])ids.Add(e);
        if(t["name"]!="" && c.Name==t["name"])names.Add(e);
      } catch {}
    }
    AutomationElement found=null;strategy=null;
    if(ids.Count==1){found=ids[0];strategy="automationId";}
    else if(ids.Count==0 && names.Count==1){found=names[0];strategy="role-name";}
    else if(ids.Count==0 && names.Count==0 && anyTypeNames.Count==1){found=anyTypeNames[0];strategy="name-fallback";}
    else if(ids.Count==0 && bestDoc!=null && (t["controlType"]=="Group" || t["controlType"]=="WebArea" || t["controlType"]=="Document")){found=bestDoc;strategy="document-viewport";}
    return found;
  }
  static Dictionary<string,string> DecodeTarget(string data){return Json.Deserialize<Dictionary<string,string>>(Encoding.UTF8.GetString(Convert.FromBase64String(data)));}
  static void Resolve(string data){
    string strategy;var found=Locate(DecodeTarget(data),out strategy);
    Rect wr;bool hasWr=GetWindowRect(Window,out wr);
    object winBounds=hasWr?new {x=wr.left,y=wr.top,width=wr.right-wr.left,height=wr.bottom-wr.top}:null;
    if(found==null){Write(new {resolved=false,reason="Target tidak terlihat atau ambigu.",windowBounds=winBounds});return;}
    var r=found.Current.BoundingRectangle;
    Write(new {resolved=true,strategy=strategy,bounds=new {x=r.X,y=r.Y,width=r.Width,height=r.Height},windowBounds=winBounds});
  }
  static bool MatchesModifiers(Dictionary<string,object> gesture){
    if(gesture==null||!gesture.ContainsKey("modifiers"))return true;
    var expected=gesture["modifiers"] as System.Collections.ArrayList;if(expected==null)return true;
    var held=new List<string>(Modifiers());foreach(var value in expected)if(!held.Contains((string)value))return false;return true;
  }
  static void Watch(string data,string action,string gestureData){
    var gesture=gestureData==null?null:Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(Convert.FromBase64String(gestureData)));
    Point? dragStart=null;int pathProgress=0;
    var target=DecodeTarget(data);string strategy;var element=Locate(target,out strategy);
    var bboxNorm=gesture!=null&&gesture.ContainsKey("bboxNorm")?gesture["bboxNorm"] as System.Collections.ArrayList:null;
    bool useBbox=element==null||(strategy=="document-viewport"&&action!="dragDrop"&&action!="scroll"&&bboxNorm!=null&&bboxNorm.Count==4);
    System.Windows.Rect bounds;
    if(!useBbox){bounds=element.Current.BoundingRectangle;}
    else if(bboxNorm!=null&&bboxNorm.Count==4){
      Rect wr;if(!GetWindowRect(Window,out wr)||wr.right<=wr.left||wr.bottom<=wr.top)throw new Exception("Target missing");
      double nx=Convert.ToDouble(bboxNorm[0]),ny=Convert.ToDouble(bboxNorm[1]),nw=Convert.ToDouble(bboxNorm[2]),nh=Convert.ToDouble(bboxNorm[3]);
      bounds=new System.Windows.Rect(wr.left+nx*(wr.right-wr.left),wr.top+ny*(wr.bottom-wr.top),Math.Max(24,nw*(wr.right-wr.left)),Math.Max(24,nh*(wr.bottom-wr.top)));
    } else {throw new Exception("Target missing");}
    Hook=SetWindowsHookEx(14,Callback,GetModuleHandle(null),0);
    if(action=="keypress")KeyboardHook=SetWindowsHookEx(13,RecordKeyCallback,GetModuleHandle(null),0);
    if(Hook==IntPtr.Zero||(action=="keypress"&&KeyboardHook==IntPtr.Zero))throw new Exception("Input observer unavailable");
    var timer=new System.Windows.Forms.Timer();timer.Interval=100;int misses=0;
    timer.Tick+=(s,a)=>{
      try{
        while(Shortcuts.Count>0){var command=Shortcuts.Dequeue();if(action=="keypress"&&gesture!=null&&gesture.ContainsKey("key")&&(string)gesture["key"]==command.Item2&&MatchesModifiers(gesture)){Write(new {kind="gesture-completed"});Application.ExitThread();return;}}
        while(Pending.Count>0){var item=Pending.Dequeue();var p=item.Item2.point;
          bool completed=false;
          if(!MatchesModifiers(gesture))continue;
          if(action=="scroll"&&item.Item1==0x20A&&bounds.Contains(p.x,p.y))completed=gesture==null||!gesture.ContainsKey("direction")||(string)gesture["direction"]==((short)(item.Item2.mouseData>>16)>0?"up":"down");
          else if(action=="dragDrop"&&gesture!=null){
            var start=(System.Collections.ArrayList)gesture["start"];var end=(System.Collections.ArrayList)gesture["end"];
            double sx=bounds.X+Convert.ToDouble(start[0])*bounds.Width,sy=bounds.Y+Convert.ToDouble(start[1])*bounds.Height,ex=bounds.X+Convert.ToDouble(end[0])*bounds.Width,ey=bounds.Y+Convert.ToDouble(end[1])*bounds.Height;
            bool middle=gesture.ContainsKey("button")&&(string)gesture["button"]=="middle";
            var points=gesture.ContainsKey("points")?(System.Collections.ArrayList)gesture["points"]:null;
            if(item.Item1==(middle?0x207:0x201)){pathProgress=0;dragStart=Math.Abs(p.x-sx)<=24&&Math.Abs(p.y-sy)<=24?(Point?)p:null;}
            if(item.Item1==0x200&&dragStart.HasValue&&points!=null){
              for(int i=pathProgress+1;i<Math.Min(points.Count,pathProgress+7);i++){var pt=(System.Collections.ArrayList)points[i];if(Math.Abs(p.x-(bounds.X+Convert.ToDouble(pt[0])*bounds.Width))<=30&&Math.Abs(p.y-(bounds.Y+Convert.ToDouble(pt[1])*bounds.Height))<=30)pathProgress=i;}
            }
            if(item.Item1==(middle?0x208:0x202)){completed=(points==null||pathProgress>=Math.Max(0,points.Count-5))&&dragStart.HasValue&&Math.Abs(p.x-ex)<=24&&Math.Abs(p.y-ey)<=24;dragStart=null;}
          }
          else if(action!="scroll"&&action!="dragDrop"&&action!="keypress"&&item.Item1==(action=="rightClick"?0x204:0x201)&&bounds.Contains(p.x,p.y))completed=true;
          if(completed){Write(new {kind=action=="scroll"||action=="dragDrop"||action=="keypress"?"gesture-completed":"target-clicked"});Application.ExitThread();return;}
        }
        if(!IsWindowVisible(Window)){Write(new {kind="target-lost"});Application.ExitThread();return;}
        if(useBbox&&bboxNorm!=null&&bboxNorm.Count==4){
          Rect wr;if(!GetWindowRect(Window,out wr)||wr.right<=wr.left||wr.bottom<=wr.top){if(++misses>=10){Write(new {kind="target-lost"});Application.ExitThread();}return;}
          misses=0;
          double nx=Convert.ToDouble(bboxNorm[0]),ny=Convert.ToDouble(bboxNorm[1]),nw=Convert.ToDouble(bboxNorm[2]),nh=Convert.ToDouble(bboxNorm[3]);
          bounds=new System.Windows.Rect(wr.left+nx*(wr.right-wr.left),wr.top+ny*(wr.bottom-wr.top),Math.Max(24,nw*(wr.right-wr.left)),Math.Max(24,nh*(wr.bottom-wr.top)));
          Write(new {kind="target-position",bounds=new {x=bounds.X,y=bounds.Y,width=bounds.Width,height=bounds.Height}});
          return;
        }
        element=Locate(target,out strategy);
        if(element==null){if(++misses>=10){Write(new {kind="target-lost"});Application.ExitThread();}return;}
        misses=0;bounds=element.Current.BoundingRectangle;
        Write(new {kind="target-position",bounds=new {x=bounds.X,y=bounds.Y,width=bounds.Width,height=bounds.Height}});
      }catch{if(++misses>=10){Write(new {kind="target-lost"});Application.ExitThread();}}
    };
    timer.Start();Write(new {kind="ready"});Application.Run();timer.Stop();UnhookWindowsHookEx(Hook);if(KeyboardHook!=IntPtr.Zero)UnhookWindowsHookEx(KeyboardHook);
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
      if(args[0]=="focus-window" && args.Length>1) {
        var targetHwnd=new IntPtr(long.Parse(args[1]));
        var fg=GetForegroundWindow();
        uint unused;
        uint fgTid=fg!=IntPtr.Zero?GetWindowThreadProcessId(fg,out unused):0;
        uint curTid=GetCurrentThreadId();
        uint tgtTid=GetWindowThreadProcessId(targetHwnd,out unused);
        if(fgTid!=0 && fgTid!=curTid)AttachThreadInput(curTid,fgTid,true);
        if(tgtTid!=0 && tgtTid!=curTid)AttachThreadInput(curTid,tgtTid,true);
        ShowWindow(targetHwnd,5);
        BringWindowToTop(targetHwnd);
        bool ok=SetForegroundWindow(targetHwnd);
        if(tgtTid!=0 && tgtTid!=curTid)AttachThreadInput(curTid,tgtTid,false);
        if(fgTid!=0 && fgTid!=curTid)AttachThreadInput(curTid,fgTid,false);
        Write(new {focused=ok,foreground=GetForegroundWindow().ToInt64().ToString()});
        return;
      }
      if(args[0]=="bring-front" && args.Length>1) {
        var targetHwnd=new IntPtr(long.Parse(args[1]));
        if(IsIconic(targetHwnd))ShowWindow(targetHwnd,9);
        else ShowWindow(targetHwnd,5);
        BringWindowToTop(targetHwnd);
        SetForegroundWindow(targetHwnd);
        Write(new {ok=true});
        return;
      }
      if(args[0]=="record-all") {
        if(args.Length>=5){HasDisplayBounds=true;DisplayX=int.Parse(args[1]);DisplayY=int.Parse(args[2]);DisplayW=int.Parse(args[3]);DisplayH=int.Parse(args[4]);}
        RecordAll=true;Record();return;
      }
      if(args[0]=="windows") {
        var rows=new List<object>();
        EnumWindows((h,p)=>{try{string title=Title(h),process=ProcessName(h);if(IsWindowVisible(h) && title!="" && process!="Lighthouse" && process!="electron") rows.Add(new {handle=h.ToInt64().ToString(),title=title,process=process});}catch{}return true;},IntPtr.Zero);
        Write(rows);return;
      }
      Window=new IntPtr(long.Parse(args[1]));
      if(!IsWindowVisible(Window))throw new Exception("Selected window is unavailable");
      if(args[0]=="record")Record();
      else if(args[0]=="resolve")Resolve(args[2]);
      else if(args[0]=="watch")Watch(args[2],args.Length>3?args[3]:"click",args.Length>4?args[4]:null);
      else if(args[0]=="snapshot") {Write(State(Window));return;

      }
    } catch {Write(new {kind="error",error="Jendela tidak dapat dibaca. Pilih ulang jendela aplikasi yang didukung."});Environment.ExitCode=1;}
  }
}

// Test-only Windows application and input driver. Never included in the installer.
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;
class TestFixture {
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 [DllImport("user32.dll")] static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);
 [DllImport("user32.dll")] static extern bool MoveWindow(IntPtr h,int x,int y,int w,int height,bool repaint);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [STAThread] static void Main(string[] args){
  SetProcessDPIAware();
  if(args[0]=="hotkey"){
   foreach(byte modifier in new byte[]{0x10,0x11,0x12,0x5B,0x5C})keybd_event(modifier,0,2,UIntPtr.Zero);
   Thread.Sleep(100);
   keybd_event(0x12,0x38,0,UIntPtr.Zero);Thread.Sleep(80);
   keybd_event(0x4C,0x26,0,UIntPtr.Zero);Thread.Sleep(120);
   keybd_event(0x4C,0x26,2,UIntPtr.Zero);keybd_event(0x12,0x38,2,UIntPtr.Zero);return;
  }
  if(args[0]=="app"){
   var form=new Form{Text=args[1],Width=500,Height=300,StartPosition=FormStartPosition.Manual,Location=new Point(600,100)};
   var save=new Button{Name="saveButton",AccessibleName="Simpan",Text="Simpan",Location=new Point(30,30),Width=150};
   var edit=new TextBox{Name="studentInput",AccessibleName="Nama",Location=new Point(30,100),Width=250};
   var status=new Label{Text="Belum disimpan",Location=new Point(30,150),Width=300};
   save.Click+=(s,e)=>status.Text="Tersimpan";
   form.Controls.Add(save);form.Controls.Add(edit);form.Controls.Add(status);
   form.Shown+=(s,e)=>{Console.WriteLine(form.Handle.ToInt64());Console.Out.Flush();};Application.Run(form);return;
  }
  var handle=new IntPtr(long.Parse(args[1]));
  if(args[0]=="focus"){keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);SetForegroundWindow(handle);Thread.Sleep(150);return;}
  if(args[0]=="move"){MoveWindow(handle,750,350,500,300,true);return;}
  var root=AutomationElement.FromHandle(handle);
  var element=root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,args[2]));
  if(element==null)throw new Exception("Test control not found");
  if(args[0]=="hide"){ShowWindow(new IntPtr(element.Current.NativeWindowHandle),0);return;}
  keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);SetForegroundWindow(handle);Thread.Sleep(150);
  var r=element.Current.BoundingRectangle;SetCursorPos((int)(r.X+r.Width/2),(int)(r.Y+r.Height/2));mouse_event(2,0,0,0,UIntPtr.Zero);Thread.Sleep(150);mouse_event(4,0,0,0,UIntPtr.Zero);
  if(args[0]=="type"){for(int i=0;i<3;i++){keybd_event(0x41,0,0,UIntPtr.Zero);Thread.Sleep(100);keybd_event(0x41,0,2,UIntPtr.Zero);Thread.Sleep(80);}}
 }
}

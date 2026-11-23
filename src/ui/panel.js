window.lighthouse.status().then(status => document.getElementById('status').textContent = status);
document.getElementById('demo').onclick = async () => {
  await window.lighthouse.demo();
  document.getElementById('result').textContent = 'Panduan demo ditampilkan.';
};
document.getElementById('hide').onclick = () => window.lighthouse.hide();

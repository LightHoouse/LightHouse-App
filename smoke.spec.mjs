import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
test('desktop panel, sandboxed preload, guide delivery and dismissal', async () => {
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.MQTT_URL;
  const executablePath = process.env.LIGHTHOUSE_TEST_EXE;
  const application = await electron.launch({ ...(executablePath ? {executablePath} : {}), args:executablePath ? [] : [path.resolve('.')], env });
  try {
    let panel;
    await expect.poll(async () => {
      for (const page of application.windows()) if ((await page.title()) === 'Lighthouse') panel = page;
      return Boolean(panel);
    }).toBe(true);
    await expect(panel.getByRole('heading', {name:'Lighthouse', exact:true})).toBeVisible();
    await expect(panel.locator('#status')).toContainText('MQTT');
    await panel.getByRole('button', {name:'Coba panduan'}).click();
    await expect(panel.getByRole('status')).toContainText('ditampilkan');
    const overlay = application.windows().find(page => page !== panel);
    await expect(overlay.locator('#guide')).toContainText('panduan demo');
    expect(await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().filter(w => w.isVisible()).length)).toBe(2);
    await panel.getByRole('button', {name:'Tutup panduan'}).click();
    await expect.poll(() => application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().filter(w => w.isVisible()).length)).toBe(1);
  } finally { await application.close(); }
});

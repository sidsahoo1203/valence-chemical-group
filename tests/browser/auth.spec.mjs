import {test,expect} from '@playwright/test';
import {startHarness} from './harness.mjs';
let harness;
test.beforeAll(async()=>{harness=await startHarness();});
test.afterAll(async()=>{await harness.close();});
const password='Browser-buyer-password-123!';
async function fillRegister(page,email){await page.getByLabel('Full name').fill('Browser Buyer');await page.getByLabel('Company name').fill('Browser Acceptance');await page.getByLabel('Business email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);}
async function register(page,email){await page.goto(harness.origin+'/register');await fillRegister(page,email);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page).toHaveURL(/\/account$/);}
test('register, returnTo after login, wrong password, duplicate, weak and empty form validation',async({page})=>{
 await register(page,'forms@example.test');await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.goto(harness.origin+'/login?returnTo=%2Fcart');await page.getByLabel('Business email',{exact:true}).fill('forms@example.test');await page.getByLabel('Password',{exact:true}).fill('incorrect');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
 await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/cart$/);
 await page.goto(harness.origin+'/account');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.goto(harness.origin+'/register');
 await page.getByRole('button',{name:'Create account',exact:true}).click();expect(await page.getByLabel('Full name').evaluate(el=>el.validity.valueMissing)).toBe(true);
 await fillRegister(page,'forms@example.test');await page.getByLabel('Password',{exact:true}).fill('short');await page.getByRole('button',{name:'Create account',exact:true}).click();expect(await page.getByLabel('Password',{exact:true}).evaluate(el=>el.validity.tooShort)).toBe(true);
 await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('alert')).toContainText('already exists');
 await page.getByRole('link',{name:'Sign in',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
});
test('forgot/reset screens use a single-use test email token and allow login with the new password',async({page})=>{
 await register(page,'reset-browser@example.test');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.goto(harness.origin+'/forgot-password');
 await page.getByLabel('Business email',{exact:true}).fill('reset-browser@example.test');await page.getByRole('button',{name:'Request reset',exact:true}).click();await expect(page.getByText('If this account exists, a password reset has been requested.')).toBeVisible();
 const message=harness.emails.find(x=>x.email==='reset-browser@example.test');expect(message).toBeTruthy();await page.goto(message.resetUrl);await page.getByLabel('New password',{exact:true}).fill('New-browser-password-456!');await page.getByRole('button',{name:'Update password',exact:true}).click();await expect(page).toHaveURL(/\/login$/);
 await page.getByLabel('Business email',{exact:true}).fill('reset-browser@example.test');await page.getByLabel('Password',{exact:true}).fill('New-browser-password-456!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/account$/);
 await page.goto(message.resetUrl);await page.getByLabel('New password',{exact:true}).fill('Another-valid-password-456!');await page.getByRole('button',{name:'Update password',exact:true}).click();await expect(page.getByRole('alert')).toContainText('invalid or expired');
 await page.goto(harness.origin+'/reset-password');await page.getByLabel('New password',{exact:true}).fill(password);await page.getByRole('button',{name:'Update password',exact:true}).click();await expect(page.getByRole('alert')).toContainText('missing its token');
});
test('simultaneous browser tabs survive reload and synchronize logout without persisted tokens',async({page,context})=>{
 await register(page,'tabs@example.test');const other=await context.newPage();await other.goto(harness.origin+'/account');await expect(other.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
 for(let i=0;i<4;i++){await Promise.all([page.reload(),other.reload()]);await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();await expect(other.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();}
 const cookie=(await context.cookies()).find(c=>c.name==='valence_refresh');expect(cookie.httpOnly).toBe(true);expect(cookie.path).toBe('/api/auth');
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/token|session/i.test(k)))).toEqual([]);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(other).toHaveURL(/\/login\?returnTo=/);await other.close();
});
test('temporary refresh throttling shows retry instead of redirecting to login',async({page})=>{
 await register(page,'retry@example.test');await page.route('**/api/auth/refresh',async route=>{await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({message:'Too many session refreshes. Please wait and retry.'})});},{times:1});
 await page.reload();await expect(page.getByRole('alert')).toContainText('Please wait and retry');await expect(page).toHaveURL(/\/account$/);await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
});

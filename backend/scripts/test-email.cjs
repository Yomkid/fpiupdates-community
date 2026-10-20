require('dotenv/config');
const {deliverEmail}=require('../dist/email-delivery.js');
const to=process.argv[2];
if(!to||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)){console.error('Usage: npm run email:test -- recipient@example.com');process.exitCode=1;}else deliverEmail({to,subject:'FpiUpdates email delivery test',text:'Your FpiUpdates email transport accepted this test message. Verification and password-reset emails use the same transport.'}).then(()=>console.log('Provider accepted the test message. Check the recipient inbox and spam folder.')).catch(()=>{console.error('Delivery failed. Check the selected transport and credentials. No credentials are printed.');process.exitCode=1;});

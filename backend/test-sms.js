import 'dotenv/config';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

console.log('--- Twilio SMS Configuration Test ---');
console.log('Account SID :', accountSid ? `${accountSid.substring(0, 6)}...${accountSid.slice(-4)}` : 'MISSING');
console.log('Auth Token  :', authToken ? '********' + authToken.slice(-4) : 'MISSING');
console.log('From Number :', fromPhone || 'NOT SET');
console.log('Service SID :', messagingServiceSid || '(None - using direct phone number)');
console.log('-------------------------------------\n');

if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
  console.error('❌ Error: Valid TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env');
  process.exit(1);
}

// Get recipient phone number from CLI argument: e.g. node test-sms.js +1234567890
const targetPhone = process.argv[2];

if (!targetPhone) {
  console.log('ℹ️ Usage: node test-sms.js <recipient_phone_number_in_E164_format>');
  console.log('Example: node test-sms.js +1234567890');
  console.log('\n⚠️ Reminder for Free Trial accounts:');
  console.log('Twilio only delivers SMS to your verified phone number (the one you used to sign up).');
  process.exit(0);
}

const client = twilio(accountSid, authToken);

const payload = {
  to: targetPhone,
  body: '🎉 Quanta: Twilio SMS configuration is working properly!',
};

if (messagingServiceSid) {
  payload.messagingServiceSid = messagingServiceSid;
} else if (fromPhone) {
  payload.from = fromPhone;
}

console.log(`⏳ Sending test SMS to ${targetPhone}...`);

try {
  const message = await client.messages.create(payload);
  console.log('\n✅ Success! SMS dispatched.');
  console.log('Message SID :', message.sid);
  console.log('Status      :', message.status);
  console.log('To          :', message.to);
  console.log('Date Created:', message.dateCreated);
} catch (err) {
  console.error('\n❌ Twilio API Error:', err.message);
  if (err.code === 572006) {
    console.error('👉 Error 572006: Twilio Free Trial restriction.');
    console.error('   Twilio Free Trial accounts do not allow sending custom free-form SMS text.');
    console.error('   To test real SMS on your phone:');
    console.error('   1. Use Twilio Console > Try it out > Send an SMS (uses pre-approved trial templates).');
    console.error('   2. Or upgrade your Twilio account by adding credit to send custom text.');
  } else if (err.code === 21608) {
    console.error('👉 Error 21608: The target number is unverified.');
    console.error('   On a Twilio Free Trial, you can only send SMS to numbers registered in:');
    console.error('   https://console.twilio.com/us1/develop/phone-numbers/manage/verified');
  } else if (err.code === 21211) {
    console.error('👉 Error 21211: Invalid phone number format. Use international E.164 (e.g. +91XXXXXXXXXX or +1XXXXXXXXXX).');
  }
  process.exit(1);
}


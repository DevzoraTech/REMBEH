import {
  buildOperatorPaymentSms,
  GSM_SMS_CREDIT_CHARS,
} from './operator-alert.service';

const base = {
  recipientName: 'Hamza Mpango',
  organizationName: 'Cognate Financial Services',
  branchName: 'Ishongororo',
  amountUgx: 120000,
  reference: 'sub_ishongororo_123456789',
};

describe('buildOperatorPaymentSms', () => {
  it('says a Flutterwave checkout is not yet paid', () => {
    const message = buildOperatorPaymentSms({
      ...base,
      kind: 'plan',
      stage: 'submitted',
      paymentMethod: 'Flutterwave',
    });

    expect(message).toContain('checkout started; NOT PAID');
    expect(message).toContain('Wait for Flutterwave confirmation');
    expect(message).not.toContain('awaiting review');
    expect(message.length).toBeLessThanOrEqual(GSM_SMS_CREDIT_CHARS);
  });

  it('distinguishes an unverified manual claim', () => {
    const message = buildOperatorPaymentSms({
      ...base,
      kind: 'plan',
      stage: 'submitted',
      paymentMethod: 'Airtel Money',
    });

    expect(message).toContain('Payment claim; NOT CONFIRMED');
    expect(message).toContain('Review in Control Center');
    expect(message.length).toBeLessThanOrEqual(GSM_SMS_CREDIT_CHARS);
  });

  it('confirms an SMS payment only after credits were applied', () => {
    const message = buildOperatorPaymentSms({
      ...base,
      amountUgx: 20000,
      kind: 'sms',
      stage: 'confirmed',
      smsUnits: 444,
    });

    expect(message).toContain('Payment verified');
    expect(message).toContain('UGX 20,000 received');
    expect(message).toContain('444 SMS credited');
    expect(message.length).toBeLessThanOrEqual(GSM_SMS_CREDIT_CHARS);
  });

  it('confirms activation for a verified subscription payment', () => {
    const message = buildOperatorPaymentSms({
      ...base,
      kind: 'plan',
      stage: 'confirmed',
    });

    expect(message).toContain('Payment verified');
    expect(message).toContain('subscription activated');
    expect(message.length).toBeLessThanOrEqual(GSM_SMS_CREDIT_CHARS);
  });
});

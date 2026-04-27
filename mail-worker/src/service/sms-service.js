import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import settingService from './setting-service';

const smsService = {

  async sendSms(c, phone, email, subject) {
    console.log('开始发送短信服务...');
    const setting = await settingService.get(c, true);
    console.log('获取到的设置:', {
      hasAccessKeyId: !!setting.aliyunAccessKeyId,
      hasAccessKeySecret: !!setting.aliyunAccessKeySecret,
      smsStatus: setting.aliyunSmsStatus
    });
    const accessKeyId = setting.aliyunAccessKeyId;
    const secretAccessKey = setting.aliyunAccessKeySecret;
    const smsStatus = setting.aliyunSmsStatus;
    const templateCode = 'SMS_501190260';
    const signName = '雪萌熊';

    if (!accessKeyId || !secretAccessKey) {
      console.error('阿里云短信服务配置缺失: accessKeyId=', !!accessKeyId, 'secretAccessKey=', !!secretAccessKey);
      throw new BizError('阿里云短信服务配置未设置', 500);
    }

    if (smsStatus !== 0) {
      console.error('阿里云短信服务未启用: smsStatus=', smsStatus);
      throw new BizError('阿里云短信服务未启用', 500);
    }

    console.log('阿里云短信服务配置验证通过，准备发送短信');

    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        console.log(`发送短信尝试 ${4 - retries}/3: 手机号 ${phone}, 邮箱 ${email}, 主题 ${subject}`);

        const result = await this.sendSmsRequest(accessKeyId, secretAccessKey, phone, signName, templateCode, email);

        console.log('SMS send result:', JSON.stringify(result));

        if (result.Code === 'OK') {
          console.log(`短信发送成功: 手机号 ${phone}, 消息ID ${result.RequestId}`);
          return result;
        } else {
          console.error(`短信发送失败: ${result.Message}, 错误码 ${result.Code}`);
          lastError = new BizError(`短信发送失败: ${result.Message}`, 500);
          retries--;
          if (retries > 0) {
            console.log(`等待 2 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } catch (error) {
        console.error('SMS send error:', error);
        lastError = new BizError(`短信发送失败: ${error.message}`, 500);
        retries--;
        if (retries > 0) {
          console.log(`等待 2 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    throw lastError;
  },

  async sendSmsRequest(accessKeyId, secretAccessKey, phone, signName, templateCode, email) {
    const date = new Date();
    const formatDate = date.getUTCFullYear() + '-' +
      String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(date.getUTCDate()).padStart(2, '0') + 'T' +
      String(date.getUTCHours()).padStart(2, '0') + ':' +
      String(date.getUTCMinutes()).padStart(2, '0') + ':' +
      String(date.getUTCSeconds()).padStart(2, '0') + 'Z';

    const parameters = {
      AccessKeyId: accessKeyId,
      Action: 'SendSms',
      Format: 'JSON',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: Math.random().toString(36).substring(2) + Date.now().toString(36),
      SignatureVersion: '1.0',
      TemplateCode: templateCode,
      Timestamp: formatDate,
      Version: '2017-05-25',
      PhoneNumbers: phone,
      SignName: signName,
      TemplateParam: JSON.stringify({ name: email })
    };

    const sortedKeys = Object.keys(parameters).sort();
    const queryString = sortedKeys.map(key => {
      const value = parameters[key];
      return `${key}=${value}`;
    }).join('&');

    const stringToSign = 'POST&%2F&' + encodeURIComponent(queryString);

    const key = secretAccessKey + '&';
    const signature = await this.hmacSha1(key, stringToSign);

    const payload = {
      AccessKeyId: accessKeyId,
      Action: 'SendSms',
      Format: 'JSON',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: parameters.SignatureNonce,
      SignatureVersion: '1.0',
      TemplateCode: templateCode,
      Timestamp: formatDate,
      Version: '2017-05-25',
      PhoneNumbers: phone,
      SignName: signName,
      TemplateParam: JSON.stringify({ name: email }),
      Signature: signature
    };

    console.log('发送短信请求 payload:', JSON.stringify(payload, null, 2));

    const response = await fetch('https://dysmsapi.aliyuncs.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(payload).toString()
    });

    return await response.json();
  },

  async hmacSha1(key, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const bytes = new Uint8Array(signature);

    return btoa(String.fromCharCode.apply(null, bytes));
  }
};

export default smsService;

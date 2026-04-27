import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import settingService from './setting-service';

const SMSClient = require('@alicloud/sms-sdk');

const smsService = {

  async sendSms(c, phone, subject) {
    // 从设置中获取阿里云短信服务配置
    const setting = await settingService.get(c, true);
    const accessKeyId = setting.aliyunAccessKeyId;
    const secretAccessKey = setting.aliyunAccessKeySecret;
    const smsStatus = setting.aliyunSmsStatus;
    const templateCode = 'SMS_501190260';
    const signName = '雪萌熊';

    // 验证配置是否存在
    if (!accessKeyId || !secretAccessKey) {
      throw new BizError('阿里云短信服务配置未设置', 500);
    }

    // 验证短信服务是否启用
    if (smsStatus !== 0) {
      throw new BizError('阿里云短信服务未启用', 500);
    }

    // 创建短信客户端
    const smsClient = new SMSClient({
      accessKeyId,
      secretAccessKey
    });

    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        console.log(`发送短信尝试 ${4 - retries}/3: 手机号 ${phone}, 主题 ${subject}`);

        // 发送短信
        const result = await smsClient.sendSMS({
          PhoneNumbers: phone,
          SignName: signName,
          TemplateCode: templateCode,
          TemplateParam: JSON.stringify({
            subject: subject
          })
        });

        console.log('SMS send result:', result);

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
  }
};

export default smsService;
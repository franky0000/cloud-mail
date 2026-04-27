import app from '../hono/hono';
import smsService from '../service/sms-service';
import result from '../model/result';
import userContext from '../security/user-context';
import userService from '../service/user-service';

app.post('/sms/send', async (c) => {
	const { phone, subject } = await c.req.json();
	const userId = userContext.getUserId(c);
	
	// 验证用户是否存在
	const user = await userService.selectById(c, userId);
	if (!user) {
		throw new BizError(t('authExpired'), 401);
	}
	
	await smsService.sendSms(c, phone, subject);
	return c.json(result.ok());
});

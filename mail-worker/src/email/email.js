import PostalMime from 'postal-mime';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import settingService from '../service/setting-service';
import attService from '../service/att-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel, settingConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import roleService from '../service/role-service';
import userService from '../service/user-service';
import telegramService from '../service/telegram-service';
import smsService from '../service/sms-service';

export async function email(message, env, ctx) {

	try {

		const {
			receive,
			tgChatId,
			tgBotStatus,
			forwardStatus,
			forwardEmail,
			ruleEmail,
			ruleType,
			r2Domain,
			noRecipient
		} = await settingService.query({ env });

		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}


		const reader = message.raw.getReader();
		let content = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			content += new TextDecoder().decode(value);
		}

		const email = await PostalMime.parse(content);

		const account = await accountService.selectByEmailIncludeDel({ env: env }, message.to);

		if (!account && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		let userRow = {}

		if (account) {
			userRow = await userService.selectByIdIncludeDel({ env: env }, account.userId);
		}

		if (account && userRow.email !== env.admin) {

			let { banEmail, availDomain } = await roleService.selectByUserId({ env: env }, account.userId);

			if (!roleService.hasAvailDomainPerm(availDomain, message.to)) {
				message.setReject('The recipient is not authorized to use this domain.');
				return;
			}

			if (roleService.isBanEmail(banEmail, email.from.address)) {
				message.setReject('The recipient is disabled from receiving emails.');
				return;
			}

		}


		if (!email.to) {
			email.to = [{ address: message.to, name: emailUtils.getName(message.to) }]
		}

		const toName = email.to.find(item => item.address === message.to)?.name || '';

		const params = {
			toEmail: message.to,
			toName: toName,
			sendEmail: email.from.address,
			name: email.from.name || emailUtils.getName(email.from.address),
			subject: email.subject,
			content: email.html,
			text: email.text,
			cc: email.cc ? JSON.stringify(email.cc) : '[]',
			bcc: email.bcc ? JSON.stringify(email.bcc) : '[]',
			recipient: JSON.stringify(email.to),
			inReplyTo: email.inReplyTo,
			relation: email.references,
			messageId: email.messageId,
			userId: account ? account.userId : 0,
			accountId: account ? account.accountId : 0,
			isDel: isDel.DELETE,
			status: emailConst.status.SAVING
		};

		const attachments = [];
		const cidAttachments = [];

		for (let item of email.attachments) {
			let attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) {
				cidAttachments.push(attachment);
			}
		}

		let emailRow = await emailService.receive({ env }, params, cidAttachments, r2Domain);

		attachments.forEach(attachment => {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		});

		try {
			if (attachments.length > 0) {
				await attService.addAtt({ env }, attachments);
			}
		} catch (e) {
			console.error(e);
		}

		emailRow = await emailService.completeReceive({ env }, account ? emailConst.status.RECEIVE : emailConst.status.NOONE, emailRow.emailId);


		if (ruleType === settingConst.ruleType.RULE) {

			const emails = ruleEmail.split(',');

			if (!emails.includes(message.to)) {
				return;
			}

		}

		//转发到TG
		if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
			await telegramService.sendEmailToBot({ env }, emailRow)
		}

		//转发到其他邮箱
		if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail) {

			const emails = forwardEmail.split(',');

			await Promise.all(emails.map(async email => {

				try {
					await message.forward(email);
				} catch (e) {
					console.error(`转发邮箱 ${email} 失败：`, e);
				}

			}));

		}

		//发送短信通知
		console.log('===== 短信通知检查开始 =====');
		console.log('检查短信通知条件:', {
			hasAccount: !!account,
			accountId: account?.accountId,
			hasUserRow: !!userRow,
			userId: userRow?.userId,
			userRowPhone: userRow?.phone,
			userRowEmail: userRow?.email,
			phoneType: typeof userRow?.phone,
			phoneIsEmpty: !userRow?.phone || userRow?.phone === '' || userRow?.phone === null
		});

		if (account && userRow && userRow.phone) {
			try {
				console.log('✅ 条件满足，准备发送短信通知：');
				console.log('  - 手机号:', userRow.phone);
				console.log('  - 邮箱:', userRow.email);
				console.log('  - 邮件主题:', email.subject || '无主题');
				console.log('  - 收件人:', message.to);

				const smsResult = await smsService.sendSms({ env: env }, userRow.phone, userRow.email, email.subject || '无主题');

				console.log('📱 短信服务返回结果:', JSON.stringify(smsResult));

				if (smsResult.Code === 'OK') {
					console.log('✅ 短信通知发送成功');
				} else if (smsResult.Code === 'SKIPPED') {
					console.log('⚠️ 短信服务未启用，请在系统设置中启用阿里云短信服务 (aliyunSmsStatus=0)');
				} else {
					console.error('❌ 短信发送失败:', smsResult);
				}
			} catch (e) {
				console.error('❌ 短信通知失败：', e);
				console.error('错误堆栈:', e.stack);
			}
		} else {
			console.log('❌ 短信通知条件不满足，跳过发送');
			console.log('  - account 存在:', !!account);
			console.log('  - userRow 存在:', !!userRow);
			console.log('  - phone 存在:', !!(userRow && userRow.phone));
			if (!account) {
				console.log('    原因: 该邮箱地址没有对应的账户记录');
			}
			if (!userRow) {
				console.log('    原因: 账户对应的用户记录不存在');
			}
			if (userRow && !userRow.phone) {
				console.log('    原因: 用户未设置手机号码，请在个人设置中配置手机号');
			}
		}
		console.log('===== 短信通知检查结束 =====');

	} catch (e) {
		console.error('邮件接收异常: ', e);
		throw e
	}
}

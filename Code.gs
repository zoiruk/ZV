/**
 * Telegram Mini App Verification System (Zoir UK)
 * Final version with full admin menu and anti-spam
 */

const BOT_TOKEN = '8685699459:AAFsGEF5AfR2KRGms8gaSYfRLfovUxlTG94';
const GROUP_ID = -1003532230570;
const SHEET_ID = '1VKxrlx0hwBwLsc0JPkgg-Q4SposyF8VXgVR7imZYMUo';
const TOPIC_ID = 5; 

const WEB_APP_URL = ScriptApp.getService().getUrl();

/**
 * Serve the Mini App UI
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Verifikatsiya | Zoir UK')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle Telegram Webhook
 */
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    
    if (checkDuplicate(update.update_id, 'upd')) return ContentService.createTextOutput("OK");

    if (update.callback_query) {
      handleCallback(update.callback_query);
      return ContentService.createTextOutput("OK");
    }

    if (update.chat_join_request) {
      handleJoinRequest(update.chat_join_request);
    }
    
    if (update.chat_member) {
      const cm = update.chat_member;
      const status = cm.new_chat_member.status;
      const oldStatus = cm.old_chat_member.status;
      if (cm.chat.id == GROUP_ID && status === 'member' && (oldStatus === 'left' || oldStatus === 'kicked')) {
        restrictAndWelcome(cm.new_chat_member.user);
      }
    }
    
    // 4. Debug commands
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || "";
      
      // Private /id
      if (update.message.chat.type === 'private' && text === '/id') {
        callTg('sendMessage', { chat_id: chatId, text: `Sizning ID: ${chatId}\nKonfiguratsiyadagi GROUP_ID: ${GROUP_ID}` });
        return ContentService.createTextOutput("OK");
      }
      
      // Group check (no slash required for testing)
      if (update.message.chat.type !== 'private' && text.toLowerCase().includes('check')) {
        callTg('sendMessage', { chat_id: chatId, text: `✅ Бот видит группу!\nID этой группы: <code>${chatId}</code>\nConfig ID: <code>${GROUP_ID}</code>`, parse_mode: 'HTML' });
        return ContentService.createTextOutput("OK");
      }
    }

    if (update.message && update.message.chat.type === 'private') {
      const text = update.message.text;
      const chatId = update.message.chat.id;
      if (text && (text === '/start' || text.startsWith('/start'))) {
        sendTmaButton(chatId, "Assalomu alaykum! Guruhda yozish uchun verifikatsiyadan o'ting.");
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error('doPost error:', err);
    return ContentService.createTextOutput("OK");
  }
}

function handleCallback(query) {
  const clickerId = query.from.id;
  if (query.data.startsWith('v_')) {
    const targetId = query.data.split('_')[1];
    if (clickerId == targetId) {
      callTg('deleteMessage', { chat_id: query.message.chat.id, message_id: query.message.message_id });
      sendTmaButton(clickerId, "Verifikatsiyani boshlash uchun pastdagi tugmani bosing:");
      callTg('answerCallbackQuery', { callback_query_id: query.id, text: "Botingizga o'ting! ✅" });
    } else {
      callTg('answerCallbackQuery', { callback_query_id: query.id, text: "Kechirasiz, bu tugma faqat yangi a'zo uchun! ❌", show_alert: true });
    }
  }
}

function sendTmaButton(chatId, text) {
  callTg('sendMessage', {
    chat_id: chatId,
    text: text,
    reply_markup: JSON.stringify({
      inline_keyboard: [[{ text: "✅ Verifikatsiyadan o'tish", web_app: { url: WEB_APP_URL } }]]
    })
  });
}

function handleJoinRequest(request) {
  const userId = request.from.id;
  if (checkDuplicate(userId, 'join_req')) return;
  sendTmaButton(userId, "<b>DIQQAT!</b> Guruhga kirish uchun avval verifikatsiyadan o'tishingiz kerak. Pastdagi tugmani bosing:");
}

function restrictAndWelcome(user) {
  if (checkDuplicate(user.id, 'welcome_grp')) return;

  // 1. Restrict user immediately
  callTg('restrictChatMember', {
    chat_id: GROUP_ID,
    user_id: user.id,
    permissions: { can_send_messages: false }
  });

  // 2. Send Welcome with Unique Button
  const name = user.first_name + (user.last_name ? ' ' + user.last_name : '');
  const mention = `<a href="tg://user?id=${user.id}">${name}</a>`;
  
  const text = `Assalomu alaykum ${mention}! Guruhga xush kelibsiz.\n\nXabar yozish uchun avval verifikatsiyadan o'tishingiz kerak. Pastdagi tugmani bosing:`;
  const keyboard = { inline_keyboard: [[{ text: "✅ Verifikatsiyadan o'tish", callback_data: `v_${user.id}` }]] };

  // 3. Try sending with Topic ID first
  let res = callTg('sendMessage', {
    chat_id: GROUP_ID,
    message_thread_id: TOPIC_ID,
    text: text,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify(keyboard)
  });

  // 4. Fallback if Topic ID fails
  const resObj = JSON.parse(res.getContentText());
  if (!resObj.ok) {
    callTg('sendMessage', {
      chat_id: GROUP_ID,
      text: text,
      parse_mode: 'HTML',
      reply_markup: JSON.stringify(keyboard)
    });
  }
}

function processMiniAppSubmission(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Users') || ss.insertSheet('Users');
  sheet.appendRow([new Date(), data.user_id, data.username, data.full_name, data.status, data.farm_name, data.seasons_count, data.sponsor_agent, data.lang]);
  const isVerified = (data.status === 'UK_NOW' || data.status === 'WORKED_BEFORE' || data.status === 'WAITING');
  if (isVerified) {
    callTg('restrictChatMember', { chat_id: GROUP_ID, user_id: data.user_id, permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true } });
    callTg('approveChatJoinRequest', { chat_id: GROUP_ID, user_id: data.user_id });
    callTg('sendMessage', { chat_id: data.user_id, text: "Tabriklaymiz! Siz verifikatsiyadan muvaffaqiyatli o'tdingiz. Endi guruhda yozishingiz mumkin. ✅" });
  } else {
    callTg('declineChatJoinRequest', { chat_id: GROUP_ID, user_id: data.user_id });
  }
  return { success: true };
}

function callTg(method, payload) {
  return UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}

function checkDuplicate(id, action) {
  const cache = CacheService.getScriptCache();
  const key = 'v4_' + id + '_' + action;
  if (cache.get(key)) return true;
  cache.put(key, '1', 120);
  return false;
}

// ── ADMIN FUNCTIONS (AS REQUESTED) ──

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🤖 Bot Admin')
      .addItem('⚡ Создать колонки (Init)', 'setupSheet')
      .addItem('📊 Статистика', 'showStats')
      .addItem('📢 Сделать рассылку', 'broadcastFromMenu')
      .addSeparator()
      .addItem('🔄 Обновить Webhook', 'setWebhook')
      .addToUi();
}

function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Users') || ss.insertSheet('Users');
  const headers = [['Timestamp', 'User ID', 'Username', 'Full Name', 'Status', 'Farm Name', 'Seasons', 'Sponsor', 'Lang']];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight('bold');
  SpreadsheetApp.getUi().alert('✅ Таблица готова!');
}

function showStats() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return;
  const count = sheet.getLastRow() - 1;
  SpreadsheetApp.getUi().alert(`📊 Статистика:\n\nВсего верификаций: ${count}`);
}

function broadcastFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('📢 Рассылка', 'Введите текст сообщения для всех пользователей:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() == ui.Button.OK) {
    const text = res.getResponseText();
    if (text) {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Users');
      const data = sheet.getDataRange().getValues();
      const sentIds = new Set();
      let sentCount = 0;
      for (let i = 1; i < data.length; i++) {
        const userId = data[i][1];
        if (userId && !sentIds.has(userId)) {
          callTg('sendMessage', { chat_id: userId, text: text });
          sentIds.add(userId);
          sentCount++;
          Utilities.sleep(50);
        }
      }
      ui.alert(`✅ Рассылка завершена! Отправлено: ${sentCount}`);
    }
  }
}

function setWebhook() {
  const res = callTg('setWebhook', { url: WEB_APP_URL, allowed_updates: JSON.stringify(["message", "chat_member", "chat_join_request", "callback_query"]) });
  SpreadsheetApp.getUi().alert('🔄 Webhook обновлен!\n\nРезультат: ' + res.getContentText());
}

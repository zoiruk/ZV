/**
 * Telegram Bot for Seasonal Workers Verification (Zoir UK)
 * Logic: Restrict new members -> Verify via DM -> Unrestrict
 */

const TOKEN = '8685699459:AAFsGEF5AfR2KRGms8gaSYfRLfovUxlTG94';
const SHEET_ID = '1TB2wzBFgln8X242muJMKL8MQw6GNJ_g8RNNy0F-YlHc';
const GROUP_ID = -1003532230570; // Тестовая группа
const BOT_USERNAME = 'Mavsumiy_Ishchilar_Jamoasi_bot'; // Замените на username вашего бота без @
const INFO_LINK = 'https://t.me/ZoirUK/1404';
const TOPIC_ID = 5; // ID топика для приветствий
const ADMIN_ID = 1001072313; // Ваш ПРАВИЛЬНЫЙ ID администратора

const STRINGS = {
  uz: {
    group_welcome: "Assalomu alaykum <a href='tg://user?id={ID}'>{NAME}</a>! Guruhga xush kelibsiz.\n\nℹ️Bu chat - faqat info va tajriba almashish uchun. Biz agentlik emasmiz.\n\n❗️Qoidalar:\n💬Faqat mavzu bo'yicha muhokama qiling\n🚫So'kinish, spam, reklama taqiqlanadi\n🤝Bir-biringizni hurmat qiling\n🛑Qoidabuzarlar bloklanadi!\n\nXabar yozish uchun avval verifikatsiyadan o'tishingiz kerak. Pastdagi tugmani bosing:",
    btn_verify: "✅ Verifikatsiyadan o'tish",
    dm_welcome: "<b>DIQQAT!</b> Faqat rost ma'lumot bering. Yolg'on ma'lumot berganlar guruhdan va botdan <b>BUTUNLAY BLOCK</b> qilinadi!\n\nGuruhda yozish uchun quyidagi savollarga javob bering:",
    q_farm_now: "1. Hozirda qaysi fermada ishlayapsiz?",
    q_farm_before: "1. Oldin qaysi fermada ishlagansiz?",
    q_operator: "1. Qaysi operator/agent (Sponsor) orqali o'tdingiz?",
    q_seasons: "2. Buyuk Britaniyada necha mavsum (sezon) ishlagansiz? (hozirgi mavsumingizni ham hisobga olib yozing)",
    q_sponsor: "3. Sizning operatoringiz yoki agentingiz (Sponsor) kim?",
    q_manual_sponsor: "Iltimos, sponsor (operator) nomini o'zingiz yozing:",
    success: "Rahmat! Ma'lumotlar saqlandi. Endi guruhda yozishingiz mumkin! ✅\n\n❗️Qoidalar eslatmasi:\n💬 Faqat mavzu bo'yicha\n🚫 So'kinish, spam va reklama taqiqlanadi\n\n@ZoirUK | @Mavsumiy_Ishchilar",
    not_worker: "Ushbu guruh faqat Buyuk Britaniyada ishlaganlar yoki taklif kutayotganlar uchun. Yolg'on ma'lumot berish blocklanishga olib keladi!\n\nSiz guruhni o'qishingiz mumkin, lekin xabar yoza olmaysiz. ❌\n\nMurojaat uchun: @Zoir_UK\n\n📣 @ZoirUK | 💬 @Mavsumiy_Ishchilar",
    already_tried: "<b>DIQQAT!</b> Siz yaqinda 'Hali bormaganman' deb javob bergansiz. Qayta urinish uchun hali vaqt bor. Siz {DAYS} kundan keyin qayta urinib ko'rishingiz mumkin.\n\nHozircha guruhda xabar yozish imkonsiz, lekin o'qishingiz mumkin. ❌\n\nAgar siz haqiqatan ham Britaniyaga kelgan bo'lsangiz, adminga yozing: @Zoir_UK\n\n📣 @ZoirUK | 💬 @Mavsumiy_Ishchilar",
    already_verified: "Siz allaqachon verifikatsiyadan o'tgansiz! ✅\n\n💬 @Mavsumiy_Ishchilar | 📣 @ZoirUK",
    input_number: "Iltimos, faqat raqam kiriting (masalan: 1)."
  }
};

function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    
    // 1. Обработка заявок на вступление (Join Requests)
    if (update.chat_join_request) {
      handleJoinRequest(update.chat_join_request);
    }
    
    // 2. Обработка изменений статуса участников (для любых входов)
    if (update.chat_member) {
      const cm = update.chat_member;
      if (cm.chat.id == GROUP_ID && cm.new_chat_member.status === 'member' && cm.old_chat_member.status === 'left') {
        restrictAndWelcome(cm.new_chat_member.user);
      }
    }
    
    // 3. Обработка тех, кто попал в группу через системное сообщение
    if (update.message && update.message.new_chat_members) {
      update.message.new_chat_members.forEach(user => {
        if (!user.is_bot) restrictAndWelcome(user);
      });
    }
    
    // 3. Обработка сообщений в личке
    if (update.message && update.message.chat.type === 'private') {
      handlePrivateMessage(update.message);
    }
    
    // 4. Обработка нажатий на кнопки (Callback Query)
    if (update.callback_query) {
      handleCallbackQuery(update.callback_query);
    }

    // Возвращаем ответ Телеграму сразу
    return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error('doPost error:', err);
    return ContentService.createTextOutput("OK");
  }
}

// Когда кто-то жмет "Вступить" в закрытую группу
function handleJoinRequest(request) {
  const userId = request.from.id;
  
  setUserState(userId, { 
    step: 'WAITING_STATUS', 
    has_pending_request: true,
    user_data: { 
      user_id: userId, 
      username: request.from.username || '', 
      full_name: request.from.first_name + (request.from.last_name ? ' ' + request.from.last_name : '') 
    } 
  });

  sendMessage(userId, STRINGS.uz.dm_welcome + "\n\nSiz hozirda qayerdasiz?", KEYBOARDS.status);
}

// Ограничиваем пользователя и пишем в группу (для открытых входов)
function restrictAndWelcome(user) {
  const url = `https://api.telegram.org/bot${TOKEN}/restrictChatMember`;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: GROUP_ID,
      user_id: user.id,
      permissions: { 
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      }
    })
  });

  const text = STRINGS.uz.group_welcome
    .replace('{ID}', user.id)
    .replace('{NAME}', user.first_name);
    
  sendGroupMessage(text, {
    inline_keyboard: [[
      { text: STRINGS.uz.btn_verify, callback_data: `v_${user.id}` }
    ]]
  });
}

// Кнопки для выбора (Inline)
const KEYBOARDS = {
  status: {
    inline_keyboard: [
      [{ text: "Hozir Buyuk Britaniyadaman", callback_data: "s_now" }],
      [{ text: "Oldin ishlaganman (Hozir uyda)", callback_data: "s_before" }],
      [{ text: "Sponsor taklifini kutayapman", callback_data: "s_candidate" }],
      [{ text: "Hali bormaganman", callback_data: "s_never" }]
    ]
  },
  seasons: {
    inline_keyboard: [
      [{ text: "1", callback_data: "z_1" }, { text: "2", callback_data: "z_2" }, { text: "3", callback_data: "z_3" }],
      [{ text: "4", callback_data: "z_4" }, { text: "5+", callback_data: "z_5" }]
    ]
  },
  sponsors: {
    inline_keyboard: [
      [{ text: "Agri-HR", callback_data: "p_Agri-HR" }, { text: "Fruitful Jobs", callback_data: "p_Fruitful Jobs" }],
      [{ text: "Concordia", callback_data: "p_Concordia" }, { text: "HOPS", callback_data: "p_HOPS" }],
      [{ text: "Pro-Force", callback_data: "p_Pro-Force" }],
      [{ text: "Boshqa", callback_data: "p_Boshqa" }]
    ]
  }
};

function handleCallbackQuery(query) {
  const userId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;
  
  if (data.startsWith('v_')) {
    const targetId = data.split('_')[1];
    if (userId.toString() !== targetId && userId !== ADMIN_ID) return;
    
    const state = { 
      step: 'WAITING_STATUS', 
      user_data: { user_id: userId, username: query.from.username || '', full_name: query.from.first_name + (query.from.last_name ? ' ' + query.from.last_name : '') } 
    };
    setUserState(userId, state);
    
    if (query.message.chat.type !== 'private') {
      deleteMessage(query.message.chat.id, messageId);
      sendMessage(userId, STRINGS.uz.dm_welcome + "\n\nSiz hozirda qayerdasiz?", KEYBOARDS.status);
    } else {
      editMessage(userId, messageId, STRINGS.uz.dm_welcome + "\n\nSiz hozirda qayerdasiz?", KEYBOARDS.status);
    }
    return;
  }
  
  const state = getUserState(userId);
  if (!state || !state.step) return;
  
  handlePrivateMessage({ from: query.from, text: data, chat: { type: 'private' }, message_id: messageId });
}

function handlePrivateMessage(msg) {
  const userId = msg.from.id;
  const text = msg.text ? msg.text.trim() : "";
  const messageId = msg.message_id;
  
  if (text === '/id') {
    sendMessage(userId, `Sizning ID: ${userId}\nChat ID: ${msg.chat.id}`);
    return;
  }
  
  if (text === '/start' || text.startsWith('/start')) {
    const history = getUserState(userId + '_history');
    if (history && history.is_verified) {
      sendMessage(userId, STRINGS.uz.already_verified);
      return;
    }
    
    setUserState(userId, { 
      step: 'WAITING_STATUS', 
      user_data: { user_id: userId, username: msg.from.username || '', full_name: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '') } 
    });
    
    const welcomeText = STRINGS.uz.dm_welcome + "\n\nSiz hozirda qayerdasiz?";
    if (messageId) {
      editMessage(userId, messageId, welcomeText, KEYBOARDS.status);
    } else {
      sendMessage(userId, welcomeText, KEYBOARDS.status);
    }
    return;
  }

  // Команда сброса для админа
  if (text.startsWith('/reset') && userId === ADMIN_ID) {
    const targetId = text.split(' ')[1];
    if (targetId) {
      clearUserState(targetId + '_history');
      sendMessage(userId, `Foydalanuvchi ${targetId} muvaffaqiyatli tozalandi! ✅`);
    } else {
      sendMessage(userId, `Iltimos ID kiriting: /reset 12345678`);
    }
    return;
  }
  
  const state = getUserState(userId);
  if (!state) return;

  switch (state.step) {
    case 'WAITING_STATUS':
      let statusValue = "";
      if (text === "s_now") statusValue = "Hozir Buyuk Britaniyadaman";
      if (text === "s_before") statusValue = "Oldin ishlaganman (Hozir uyda)";
      if (text === "s_candidate") {
        statusValue = "Sponsor taklifini kutayapman";
        state.user_data.seasons_count = 0;
        state.user_data.farm_name = "-";
      }
      if (text === "s_never") {
        state.user_data.seasons_count = 0;
        state.user_data.sponsor_agent = "Hali bormaganman";
        state.user_data.status = "Hali bormaganman";
        finishVerification(userId, state);
        return;
      }
      
      if (!statusValue) return; // Игнорируем неверные нажатия
      
      state.user_data.status = statusValue;
      
      let q = STRINGS.uz.q_farm_before;
      let kb = { remove_keyboard: true };
      
      if (statusValue === "Hozir Buyuk Britaniyadaman") q = STRINGS.uz.q_farm_now;
      
      if (statusValue === "Sponsor taklifini kutayapman") {
        q = STRINGS.uz.q_operator;
        kb = KEYBOARDS.sponsors;
        state.step = 'WAITING_SPONSOR';
      } else {
        state.step = 'WAITING_FARM';
      }
      
      setUserState(userId, state);
      
      if (messageId) {
        editMessage(userId, messageId, q, kb);
      } else {
        sendMessage(userId, q, kb);
      }
      break;

    case 'WAITING_FARM':
      // Кандидаты не проходят WAITING_FARM через этот кейс, если нажали кнопку
      // Но если они написали текст (Boshqa), то попадают сюда
      state.user_data.farm_name = text;
      state.step = 'WAITING_SEASONS';
      setUserState(userId, state);
      sendMessage(userId, STRINGS.uz.q_seasons, KEYBOARDS.seasons);
      break;

    case 'WAITING_SEASONS':
      const seasonsCount = text.replace('z_', '');
      state.user_data.seasons_count = seasonsCount;
      state.step = 'WAITING_SPONSOR';
      setUserState(userId, state);
      
      if (messageId) {
        editMessage(userId, messageId, STRINGS.uz.q_sponsor, KEYBOARDS.sponsors);
      } else {
        sendMessage(userId, STRINGS.uz.q_sponsor, KEYBOARDS.sponsors);
      }
      break;

    case 'WAITING_SPONSOR':
      if (text === "Boshqa") {
        state.step = 'WAITING_SPONSOR_MANUAL';
        setUserState(userId, state);
        sendMessage(userId, STRINGS.uz.q_manual_sponsor, { remove_keyboard: true });
        return;
      }
      state.user_data.sponsor_agent = text;
      finishVerification(userId, state);
      break;

    case 'WAITING_SPONSOR_MANUAL':
      state.user_data.sponsor_agent = text;
      if (state.user_data.status === "Sponsor taklifini kutayapman") {
        state.user_data.farm_name = "-";
        state.user_data.seasons_count = 0;
      }
      finishVerification(userId, state);
      break;
  }
}

function finishVerification(userId, state) {
  const data = state.user_data;
  saveToSheet(data);
  
  let successMsg = STRINGS.uz.success;
  const isVerified = (data.seasons_count > 0 || data.status === "Sponsor taklifini kutayapman");

  if (isVerified) {
    if (state.has_pending_request) {
      approveRequest(userId);
    } else {
      unrestrictUser(userId);
    }
  } else {
    if (state.has_pending_request) {
      declineRequest(userId);
    }
    successMsg = STRINGS.uz.not_worker;
  }

  sendMessage(userId, successMsg, { remove_keyboard: true });
  clearUserState(userId);
  
  // Сохраняем статус верификации
  if (isVerified) {
    setUserState(userId + '_history', { is_verified: true });
  } else {
    setUserState(userId + '_history', { failed_at: new Date().getTime() });
  }
}

function approveRequest(userId) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/approveChatJoinRequest`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: GROUP_ID, user_id: userId })
  });
}

function declineRequest(userId) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/declineChatJoinRequest`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: GROUP_ID, user_id: userId })
  });
}

function unrestrictUser(userId) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/restrictChatMember`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: GROUP_ID,
      user_id: userId,
      permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true }
    })
  });
}

function sendMessage(chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
  
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}

function sendGroupMessage(text, replyMarkup) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: GROUP_ID, message_thread_id: TOPIC_ID, text: text, parse_mode: 'HTML', reply_markup: replyMarkup })
  });
}

function saveToSheet(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.appendRow(['Timestamp', 'User ID', 'Username', 'Full Name', 'Farm Name', 'Seasons', 'Sponsor', 'Reset? (Type OK)']);
  }
  sheet.appendRow([new Date(), data.user_id, data.username, data.full_name, data.farm_name, data.seasons_count, data.sponsor_agent, '']);
}

// Автоматический сброс и рассылка при редактировании таблицы
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const val = range.getValue();
  
  // 1. Сброс пользователя (в листе Users)
  if (sheet.getName() === 'Users' && range.getColumn() === 8 && val === 'OK' && range.getRow() > 1) {
    const row = range.getRow();
    const userId = sheet.getRange(row, 2).getValue();
    if (userId) {
      clearUserState(userId + '_history');
      range.setValue('RESET DONE ✅');
    }
  }
  
  // 2. Рассылка сообщений (в листе Admin)
  if (sheet.getName() === 'Admin' && range.getA1Notation() === 'B6' && val === true) {
    const msgText = sheet.getRange('B5').getValue();
    if (msgText) {
      range.setValue('Yuborilmoqda...');
      broadcastMessage(msgText);
      range.setValue(false);
      console.log('Xabar hamma foydalanuvchilarga yuborildi!');
    } else {
      range.setValue(false);
      console.log('Iltimos, avval xabar matnini yozing!');
    }
  }
}

function broadcastMessage(text) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const sentIds = new Set();
  
  for (let i = 1; i < data.length; i++) {
    const userId = data[i][1];
    if (userId && !sentIds.has(userId)) {
      sendMessage(userId, text);
      sentIds.add(userId);
      Utilities.sleep(50); // Небольшая пауза, чтобы не превысить лимиты
    }
  }
}

// Создание админ-панели
function createAdminPanel() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Admin');
  if (!sheet) {
    sheet = ss.insertSheet('Admin');
  } else {
    sheet.clear();
  }
  
  sheet.getRange('A1:B1').merge().setValue('🤖 BOT ADMIN PANEL').setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  
  // Статистика
  sheet.getRange('A3').setValue('📊 Statistika:').setFontWeight('bold');
  sheet.getRange('A4').setValue('Jami a\'zolar:');
  sheet.getRange('B4').setFormula('=COUNTA(Users!B2:B)');
  
  // Рассылка
  sheet.getRange('A5').setValue('📢 Rassilka matni:').setFontWeight('bold');
  sheet.getRange('B5').setBackground('#f3f3f3').setBorder(true, true, true, true, null, null);
  sheet.getRange('A6').setValue('🚀 Yuborish (Belgilang):').setFontWeight('bold');
  sheet.getRange('B6').insertCheckboxes();
  
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 400);
  
  console.log('Admin paneli yaratildi!');
}

// Создание меню при открытии таблицы
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 Бот Админ')
      .addItem('🚀 Рассылка (Broadcast)', 'broadcastFromMenu')
      .addItem('♻️ Сбросить пользователя', 'resetFromMenu')
      .addItem('🧹 Сбросить МОЮ память (Админ)', 'resetMyMemory')
      .addSeparator()
      .addItem('🛠️ Создать/Обновить лист Admin', 'createAdminPanel')
      .addToUi();
}

// Рассылка через меню
function broadcastFromMenu() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt('🚀 Рассылка', 'Hamma a\'zolarga yuboriladigan xabar matnini kiriting:', ui.ButtonSet.OK_CANCEL);
    
    if (response.getSelectedButton() == ui.Button.OK) {
      const text = response.getResponseText();
      if (text) {
        broadcastMessage(text);
        ui.alert('✅ Xabar muvaffaqiyatli yuborildi!');
      }
    }
  } catch (e) {
    console.log('UI ga kirish imkonsiz. Funktsiyani jadval menyusidan ishga tushiring.');
  }
}

// Сброс пользователя через меню
function resetFromMenu() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt('♻️ Foydalanuvchini tozash', 'Tozalanadigan foydalanuvchi ID-sini kiriting:', ui.ButtonSet.OK_CANCEL);
    
    if (response.getSelectedButton() == ui.Button.OK) {
      const userId = response.getResponseText();
      if (userId) {
        clearUserState(userId + '_history');
        ui.alert('✅ Foydalanuvchi ' + userId + ' muvaffaqiyatli tozalandi!');
      }
    }
  } catch (e) {
    console.log('UI ga kirish imkonsiz.');
  }
}

// Сброс памяти самого админа
function resetMyMemory() {
  clearUserState(ADMIN_ID + '_history');
  try {
    SpreadsheetApp.getUi().alert('✅ Sizning tarixingiz tozalandi! Endi botni qaytadan test qilishingiz mumkin.');
  } catch (e) {
    console.log('Tarix tozalandi (UI xabari ko\'rsatilmadi).');
  }
}

function setUserState(userId, state) { PropertiesService.getUserProperties().setProperty('state_' + userId, JSON.stringify(state)); }
function getUserState(userId) { const s = PropertiesService.getUserProperties().getProperty('state_' + userId); return s ? JSON.parse(s) : null; }
function clearUserState(userId) { PropertiesService.getUserProperties().deleteProperty('state_' + userId); }

// Обработка нажатий на кнопки в группе
function handleCallbackQuery(query) {
  const userId = query.from.id;
  const data = query.data;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  
  if (data.startsWith('v_')) {
    const targetId = data.split('_')[1];
    
    if (userId == targetId) {
      // 1. Удаляем приветствие из группы
      deleteMessage(chatId, messageId);
      
      // 2. Показываем уведомление с ссылкой
      const botUrl = `https://t.me/${BOT_USERNAME}?start=verify`;
      answerCallbackQuery(query.id, "Botga o'ting va savollarga javob bering!", true, botUrl);
    } else {
      // 3. Если нажал чужой
      answerCallbackQuery(query.id, "Kechirasiz, bu tugma faqat yangi a'zo uchun! ❌", true);
    }
  }
}

function answerCallbackQuery(queryId, text, showAlert, url) {
  const payload = {
    callback_query_id: queryId,
    text: text,
    show_alert: showAlert || false
  };
  if (url) payload.url = url;
  
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}

function deleteMessage(chatId, messageId) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/deleteMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, message_id: messageId })
  });
}

function editMessage(chatId, messageId, text, keyboard) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML'
  };
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);
  
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}

function setWebhook() {
  const webAppUrl = 'https://script.google.com/macros/s/AKfycbzzJeA43i0Pt6GEbvSGyYnv6vNnzEx-L9RalpfgnfPTxO7UB_hFP01ZV4v5xdQMUIrocQ/exec';
  const tgUrl = `https://api.telegram.org/bot${TOKEN}/setWebhook`;
  const payload = { url: webAppUrl, allowed_updates: JSON.stringify(["message", "chat_member", "chat_join_request"]) };
  const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload) };
  UrlFetchApp.fetch(tgUrl, options);
}

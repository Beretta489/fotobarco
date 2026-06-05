const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const GROUP_MAP = {
  '-1003981585031': { session: '09:00', family: 'Familia 1' },
  '-1003762092274': { session: '09:00', family: 'Familia 2' },
  '-1003812699090': { session: '09:00', family: 'Familia 3' },
  '-1003962814430': { session: '09:00', family: 'Familia 4' },
  '-1004299038223': { session: '09:00', family: 'Familia 5' },
  '-1003967412352': { session: '09:00', family: 'Familia 6' },
  '-1003753902955': { session: '09:00', family: 'Familia 7' },
  '-1003854263645': { session: '10:15', family: 'Familia 1' },
  '-1003830534042': { session: '10:15', family: 'Familia 2' },
  '-1003858415252': { session: '10:15', family: 'Familia 3' },
  '-1003924687847': { session: '10:15', family: 'Familia 4' },
  '-1003952634432': { session: '10:15', family: 'Familia 5' },
  '-1003921136314': { session: '10:15', family: 'Familia 6' },
  '-1004292368522': { session: '10:15', family: 'Familia 7' },
  '-1003984462299': { session: '11:45', family: 'Familia 1' },
  '-1003806542253': { session: '11:45', family: 'Familia 2' },
  '-1003951340244': { session: '11:45', family: 'Familia 3' },
  '-1004297770729': { session: '11:45', family: 'Familia 4' },
  '-1003756945184': { session: '11:45', family: 'Familia 5' },
  '-1003967100468': { session: '11:45', family: 'Familia 6' },
  '-1003852239924': { session: '11:45', family: 'Familia 7' },
  '-1003987316266': { session: '13:30', family: 'Familia 1' },
  '-1003903094853': { session: '13:30', family: 'Familia 2' },
  '-1003908498948': { session: '13:30', family: 'Familia 3' },
  '-1003903030142': { session: '13:30', family: 'Familia 4' },
  '-1003552799056': { session: '13:30', family: 'Familia 5' },
  '-1003982440623': { session: '13:30', family: 'Familia 6' },
  '-1003715924588': { session: '13:30', family: 'Familia 7' },
  '-1003331917062': { session: '14:45', family: 'Familia 1' },
  '-1003975262283': { session: '14:45', family: 'Familia 2' },
  '-1003946154612': { session: '14:45', family: 'Familia 3' },
  '-1003976266192': { session: '14:45', family: 'Familia 4' },
  '-1003971236188': { session: '14:45', family: 'Familia 5' },
  '-1003942645234': { session: '14:45', family: 'Familia 6' },
  '-1003971640032': { session: '14:45', family: 'Familia 7' },
  '-1003971945358': { session: '16:00', family: 'Familia 1' },
  '-1003964751884': { session: '16:00', family: 'Familia 2' },
  '-1003885030920': { session: '16:00', family: 'Familia 3' },
  '-1003985496253': { session: '16:00', family: 'Familia 4' },
  '-1003949847223': { session: '16:00', family: 'Familia 5' },
  '-1003813789711': { session: '16:00', family: 'Familia 6' },
  '-1004291891332': { session: '16:00', family: 'Familia 7' },
};

const HORARIOS = ['09:00', '10:15', '11:45', '13:30', '14:45', '16:00'];

async function getOrCreateSession(timeStr) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const name = `Passeio ${timeStr}`;

  const { data: existing } = await supabase
    .from('sessions')
    .select('*')
    .eq('name', name)
    .eq('active', true)
    .gte('created_at', `${dateStr}T00:00:00`)
    .single();

  if (existing) return existing;

  const [h, m] = timeStr.split(':');
  const scheduledAt = new Date();
  scheduledAt.setHours(parseInt(h), parseInt(m), 0, 0);

  const { data, error } = await supabase
    .from('sessions')
    .insert({ name, scheduled_at: scheduledAt.toISOString(), active: true })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateGroup(sessionId, familyName, telegramGroupId) {
  const { data: existing } = await supabase
    .from('groups')
    .select('*')
    .eq('session_id', sessionId)
    .eq('telegram_group_id', telegramGroupId)
    .single();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('groups')
    .insert({
      session_id: sessionId,
      name: familyName,
      telegram_group_id: telegramGroupId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.get(url, (res) => {
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function uploadPhoto(sessionId, groupId, fileBuffer, fileName) {
  const path = `${sessionId}/${groupId}/${Date.now()}_${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(path, fileBuffer, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('photos')
    .getPublicUrl(path);

  const { error } = await supabase
    .from('photos')
    .insert({
      session_id: sessionId,
      group_id: groupId,
      url: publicUrl,
      storage_path: path,
      price: 15.00,
    });

  if (error) throw error;
  console.log(`✅ Foto salva: ${path}`);
}

bot.on('photo', async (msg) => {
  const chatId = String(msg.chat.id);
  const groupInfo = GROUP_MAP[chatId];

  if (!groupInfo) {
    console.log(`⚠️ Grupo não mapeado: ${chatId}`);
    return;
  }

  console.log(`📸 Foto recebida em ${groupInfo.session} - ${groupInfo.family}`);

  try {
    const session = await getOrCreateSession(groupInfo.session);
    const group = await getOrCreateGroup(session.id, groupInfo.family, chatId);

    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const fileName = file.file_path.split('/').pop();

    const buffer = await downloadFile(fileUrl);
    await uploadPhoto(session.id, group.id, buffer, fileName);

    console.log(`✅ ${groupInfo.session} - ${groupInfo.family}: foto processada!`);
  } catch (e) {
    console.error(`❌ Erro ao processar foto:`, e.message);
  }
});

cron.schedule('30 8 * * *', async () => {
  console.log('🌅 Criando sessões do dia...');
  for (const horario of HORARIOS) {
    try {
      await getOrCreateSession(horario);
      console.log(`✅ Sessão ${horario} criada`);
    } catch (e) {
      console.error(`❌ Erro ao criar sessão ${horario}:`, e.message);
    }
  }
}, { timezone: 'America/Fortaleza' });

cron.schedule('0 23 * * *', async () => {
  console.log('🧹 Limpando fotos do dia...');
  try {
    const { data: photos } = await supabase
      .from('photos')
      .select('storage_path');

    if (photos && photos.length > 0) {
      const paths = photos.map(p => p.storage_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from('photos').remove(paths);
      }
    }

    await supabase.from('photos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('groups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('sessions').update({ active: false }).eq('active', true);

    console.log('✅ Limpeza concluída!');
  } catch (e) {
    console.error('❌ Erro na limpeza:', e.message);
  }
}, { timezone: 'America/Fortaleza' });

console.log('🐬 FotoJanga Bot rodando...');
console.log(`📱 ${Object.keys(GROUP_MAP).length} grupos monitorados`);
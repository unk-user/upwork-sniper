import TelegramBot from 'node-telegram-bot-api';
import type { Job, ResponseData } from './types';
import sqlite from 'bun:sqlite';

const map = new Map<string, string>();

const bot = new TelegramBot(process.env.BOT_TOKEN!, { polling: true });
const db = sqlite.open('sniper.db');

db.exec('CREATE TABLE IF NOT EXISTS feeds (chat_id INTEGER, skills TEXT);');
const feeds = db.prepare('SELECT * FROM feeds').all() as {
  chat_id: number;
  skills: string;
}[];
console.log(`feeds: ${JSON.stringify(feeds)}`);

bot.onText(/\/start/, (msg) => {
  if (rateLimit(msg.chat.id)) return;
  bot.sendMessage(
    msg.chat.id,
    `Hello ${
      msg.from?.first_name || 'Anonymous'
    }!\nCreate Your feed by sending the /feed command followed by a list of your skills (if the skill contains spaces use underscore instead).\nTo get your feed, send /myfeed.`
  );
});

bot.onText(/\/feed (.+)/, async (msg, match) => {
  if (rateLimit(msg.chat.id)) return;
  const totalFeeds = db.prepare('SELECT COUNT(*) FROM feeds').get() as {
    count: number;
  };
  if (totalFeeds.count >= 20) {
    bot.sendMessage(
      msg.chat.id,
      'Sorry we have reached the limit of 20 feeds. try again later.'
    );
  }

  const skills = match ? match[1] : null;
  if (!skills) {
    bot.sendMessage(msg.chat.id, 'Please provide at least one skill.');
  }

  const existingFeed = db
    .prepare('SELECT * FROM feeds WHERE chat_id = ?')
    .get(msg.chat.id);
  if (!!existingFeed) {
    db.prepare('UPDATE feeds SET skills = ? WHERE chat_id = ?').run(
      skills,
      msg.chat.id
    );

    bot.sendMessage(msg.chat.id, 'Feed updated successfully.');
  } else {
    db.prepare('INSERT INTO feeds (chat_id, skills) VALUES (?, ?)').run(
      msg.chat.id,
      skills
    );

    bot.sendMessage(msg.chat.id, 'Feed created successfully.');
  }
});

bot.onText(/\/myfeed/, (msg) => {
  if (rateLimit(msg.chat.id)) return;

  const feed = db
    .prepare('SELECT * FROM feeds WHERE chat_id = ?')
    .get(msg.chat.id) as { chat_id: number; skills: string } | null;
  if (!feed) {
    bot.sendMessage(msg.chat.id, 'No feed found.');
  } else {
    bot.sendMessage(msg.chat.id, `Your feed: ${feed.skills}`);
  }
});

const userRateLimits = new Map<number, number>();

const rateLimit = (chatId: number): boolean => {
  const now = Date.now();

  if (userRateLimits.has(chatId)) {
    const lastCommandTime = userRateLimits.get(chatId)!;
    const cooldown = 2000;

    if (now - lastCommandTime < cooldown) {
      bot.sendMessage(
        chatId,
        `You're sending commands too quickly. Please wait ${Math.ceil(
          (cooldown - (now - lastCommandTime)) / 1000
        )} seconds.`
      );

      return true;
    }
  }
  userRateLimits.set(chatId, now);
  return false;
};

const server = Bun.serve({
  async fetch(req) {
    const secretKey = req.headers.get('X-Secret-Key');
    if (secretKey !== process.env.SECRET_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.text();
    if (!body) {
      console.log('no body');
      return new Response(null, {
        status: 200,
      });
    }

    let data = JSON.parse(body) as ResponseData;
    data = data.filter((job) => {
      if (map.has(job.uid)) return false;
      map.set(job.uid, job.uid);
      return true;
    });

    if (data.length === 0) {
      return new Response(null, {
        status: 200,
      });
    }

    const feeds = db.prepare('SELECT * FROM feeds').all() as {
      chat_id: number;
      skills: string;
    }[];
    for (const feed of feeds) {
      const relatedJobs = data.filter((job) => {
        return job.skills.some((skill) =>
          feed.skills.split(' ').includes(skill)
        );
      });

      if (relatedJobs.length > 0) {
        for (const job of relatedJobs) {
          bot.sendMessage(feed.chat_id, formatJob(job), { parse_mode: 'HTML' });
        }
      }
    }

    return new Response(null, {
      status: 200,
    });
  },
  port: 3000,
});

const formatJob = (job: Job) => {
  return `<b>${job.title}</b>
💰 <b>Budget:</b> ${job.fixedPrice || 'Not specified'}
📈 <b>Experience Level:</b> ${job.experienceLevel}
⏳ <b>Duration:</b> ${job.duration || 'Not specified'}
📋 <b>Job Type:</b> ${job.jobType}

<b>Skills Required:</b> ${job.skills.join(', ')}

<b>Description:</b>
${job.description.slice(0, 300)}... <i>(Click below for details)</i>

🕒 <b>Posted At:</b> ${job.publishedAt}
<a href="https://www.upwork.com/jobs/${job.uid}">🔗 View Job</a>
`;
};

console.log(`server running on port=${server.port}...`);

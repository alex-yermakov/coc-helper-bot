import dotenv from 'dotenv';
import fetch from 'node-fetch';

import { Bot, Context } from "grammy";
import { InputFile, Message } from "grammy/types";

dotenv.config();

const { BOT_TOKEN, COC_TOKEN, COC_API_URL } = process.env as {
    BOT_TOKEN: string;
    COC_TOKEN: string;
    COC_API_URL: string;
};

const bot = new Bot(BOT_TOKEN);
const headers = {
    'Authorization': `Bearer ${COC_TOKEN}`,
    'Content-Type': 'application/json'
};

class InternalError extends Error { }

const tryGetStats = async ({ text, entities }: Message) => {
    const tagEntry = entities?.find(({ type }) => type === 'hashtag');

    if (!tagEntry || !text) {
        throw new InternalError(`Enter the player's tag after the command, starting with the #`);
    }

    const tag = text.substring(tagEntry.offset, tagEntry.offset + tagEntry.length);
    const response = await fetch(`${COC_API_URL}/players/${encodeURIComponent(tag)}`, { headers });

    if (response.status === 404) {
        throw new InternalError(`Coulnd't find account by the tag ${tag}`);
    }

    if (response.status !== 200) {
        throw new Error();
    }

    const stats = await response.json();
    const slug = encodeURI(`${stats.name.toLowerCase()}-${tag.substring(1)}`);
    const cosLink = `https://www.clashofstats.com/players/${slug}/summary`;

    return [
        `<b>Found the player</b>: <a href="${cosLink}">${stats.name} ${tag}</a>\n`,
        !!stats.clan && `<b>Clan</b>: ${stats.clan.name} ${stats.clan.tag}`,
        `<b>Town Hall Level</b>: ${stats.townHallLevel}`,
        `<b>Trophies</b>: ${stats.trophies}`,
        `<b>Best trophies</b>: ${stats.bestTrophies}`,
        `<b>War stars</b>: ${stats.warStars}`,
    ]
        .filter(Boolean)
        .join('\n');
};

const tryVerifyOwnership = async ({ text }: Message) => {
    const [, tag, code] = text?.match(/\/\w+ (#\w+) (\w+)?/) ?? [];

    if (!tag || !code) {
        throw new InternalError(`Enter the player's tag and the verification code after the command`);
    }

    const response = await fetch(`${COC_API_URL}/players/${encodeURIComponent(tag)}/verifytoken`, {
        body: JSON.stringify({ token: code }),
        method: 'post',
        headers
    });

    if (response.status !== 200) {
        throw new Error();
    }

    const result = await response.json();

    if (result.status === 'ok') {
        return '✅ Ownership confirmed!';
    } else {
        return '❌ Verification code is invalid';
    }
};

const handleError = (error: unknown, ctx: Context) => {
    if (error instanceof InternalError) {
        ctx.reply(`❌ ${error.message}`);
    } else {
        ctx.reply('❌ Something went wrong. Please try again later');
    }
}

bot.command(['start', 'help'], async (ctx) => {
    const help = [
        '<b>Welcome to CoC Helper Bot</b>',
        'You can use the following commands\n',
        '/stats - Shows a brief stats for a player',
        '/stats #playerTag\n',
        '/verify - Verifies account ownership',
        '/verify #playerTag apiToken'
    ].join('\n');

    await ctx.replyWithVideo('BAACAgIAAxkBAAPvZMrHoFvK223F0uVmCJm0P1Q7V6IAAg8yAAL2e1FKaZZCAfErnfgvBA');
    ctx.reply(help, { parse_mode: 'HTML' });
});

bot.command('stats', async (ctx) => {
    if (!ctx.message) {
        return;
    }

    try {
        const stats = await tryGetStats(ctx.message);

        await ctx.replyWithSticker('CAACAgEAAxkBAANOZMqb1NYuIzcycWhj8XHUX6dj77AAAlAAA8GZigABNpX804CbHk0vBA');
        ctx.reply(stats, { parse_mode: 'HTML' });
    } catch (error) {
        handleError(error, ctx);

    }

    ctx.deleteMessage();
});

bot.command('verify', async (ctx) => {
    if (!ctx.message) {
        return;
    }

    try {
        ctx.reply(await tryVerifyOwnership(ctx.message), { parse_mode: 'HTML' });
    } catch (error) {
        handleError(error, ctx);
    }

    ctx.deleteMessage();
});

bot.start();
bot.api.setMyCommands([
    { command: 'help', description: 'Show basic intro' }
]);

/* eslint-disable no-unused-expressions, prefer-arrow-callback */
import chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import irc from 'irc-upd';
import discord from 'discord.js';
import logger from '../lib/logger';
import Bot from '../lib/bot';
import createDiscordStub from './stubs/discord-stub';
import ClientStub from './stubs/irc-client-stub';
import createWebhookStub from './stubs/webhook-stub';
import config from './fixtures/single-test-config.json';
import configMsgFormatDefault from './fixtures/msg-formats-default.json';

const { expect } = chai;
chai.should();
chai.use(sinonChai);

describe('Bot', function () {
  const sandbox = sinon.createSandbox({
    useFakeTimers: false,
    useFakeServer: false,
  });

  beforeEach(function () {
    this.infoSpy = sandbox.stub(logger, 'info');
    this.debugSpy = sandbox.stub(logger, 'debug');
    this.errorSpy = sandbox.stub(logger, 'error');
    this.sendStub = sandbox.stub();

    irc.Client = ClientStub;
    discord.Client = createDiscordStub(this.sendStub);

    ClientStub.prototype.say = sandbox.stub();
    ClientStub.prototype.send = sandbox.stub();
    ClientStub.prototype.join = sandbox.stub();
    this.sendWebhookMessageStub = sandbox.stub();
    discord.WebhookClient = createWebhookStub(this.sendWebhookMessageStub);

    this.setCustomBot = (conf) => {
      this.bot = new Bot(conf);
      this.guild = this.bot.discord.guilds.cache.first();
      this.bot.connect();
    };

    this.setCustomBot(config);

    // modified variants of https://github.com/discordjs/discord.js/blob/stable/src/client/ClientDataManager.js
    // (for easier stubbing)
    this.addUser = function (user, member = null) {
      const userObj = new discord.User(this.bot.discord, user);
      // also set guild members
      const guildMember = { ...(member || user), user: userObj };
      guildMember.nick = guildMember.nickname; // nick => nickname in Discord API
      const memberObj = new discord.GuildMember(
        this.bot.discord,
        guildMember,
        this.guild
      );
      this.guild.members.cache.set(userObj.id, memberObj);
      this.bot.discord.users.cache.set(userObj.id, userObj);
      return memberObj;
    };

    this.addRole = function (role) {
      const roleObj = new discord.Role(this.bot.discord, role, this.guild);
      this.guild.roles.cache.set(roleObj.id, roleObj);
      return roleObj;
    };

    this.addEmoji = function (emoji) {
      const emojiObj = new discord.GuildEmoji(
        this.bot.discord,
        emoji,
        this.guild
      );
      this.guild.emojis.cache.set(emojiObj.id, emojiObj);
      return emojiObj;
    };
  });

  afterEach(function () {
    sandbox.restore();
  });

  const createAttachments = (url) => {
    const attachments = new discord.Collection();
    attachments.set(1, { url });
    return attachments;
  };

  it('should invert the channel mapping', function () {
    this.bot.invertedMapping['#irc'].should.equal('#discord');
  });

  it('should send correctly formatted messages to discord', function () {
    const username = 'testuser';
    const text = 'test message';
    const formatted = `**<${username}>** ${text}`;
    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(formatted);
  });

  it('should lowercase channel names before sending to discord', function () {
    const username = 'testuser';
    const text = 'test message';
    const formatted = `**<${username}>** ${text}`;
    this.bot.sendToDiscord(username, '#IRC', text);
    this.sendStub.should.have.been.calledWith(formatted);
  });

  it("should not send messages to discord if the channel isn't in the channel mapping", function () {
    this.bot.sendToDiscord('user', '#no-irc', 'message');
    this.sendStub.should.not.have.been.called;
  });

  it("should not send messages to discord if it isn't in the channel", function () {
    this.bot.sendToDiscord('user', '#otherirc', 'message');
    this.sendStub.should.not.have.been.called;
  });

  it('should send to a discord channel ID appropriately', function () {
    const username = 'testuser';
    const text = 'test message';
    const formatted = `**<${username}>** ${text}`;
    this.bot.sendToDiscord(username, '#channelforid', text);
    this.sendStub.should.have.been.calledWith(formatted);
  });

  it("should not send special messages to discord if the channel isn't in the channel mapping", function () {
    this.bot.sendExactToDiscord('#no-irc', 'message');
    this.sendStub.should.not.have.been.called;
  });

  it("should not send special messages to discord if it isn't in the channel", function () {
    this.bot.sendExactToDiscord('#otherirc', 'message');
    this.sendStub.should.not.have.been.called;
  });

  it('should send special messages to discord', function () {
    this.bot.sendExactToDiscord('#irc', 'message');
    this.sendStub.should.have.been.calledWith('message');
    this.debugSpy.should.have.been.calledWith(
      'Sending special message to Discord',
      'message',
      '#irc',
      '->',
      '#discord'
    );
  });

  it('should not color irc messages if the option is disabled', function () {
    const text = 'testmessage';
    const newConfig = { ...config, ircNickColor: false };
    this.setCustomBot(newConfig);
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    const expected = `<${message.author.username}> ${text}`;
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should only use message color defined in config', function () {
    const text = 'testmessage';
    const newConfig = { ...config, ircNickColors: ['orange'] };
    this.setCustomBot(newConfig);
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    const expected = `<\u000307${message.author.username}\u000f> ${text}`;
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should send correct messages to irc', function () {
    const text = 'testmessage';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    // Wrap in colors:
    const expected = `<\u000304${message.author.username}\u000f> ${text}`;
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should send to IRC channel mapped by discord channel ID if available', function () {
    const text = 'test message';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        id: 1234,
        name: 'namenotinmapping',
      },
      author: {
        username: 'test',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    // Wrap it in colors:
    const expected = `<\u000312${message.author.username}\u000f> test message`;
    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.have.been.calledWith(
      '#channelforid',
      expected
    );
  });

  it('should send to IRC channel mapped by discord channel name if ID not available', function () {
    const text = 'test message';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        id: 1235,
        name: 'discord',
      },
      author: {
        username: 'test',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    // Wrap it in colors:
    const expected = `<\u000312${message.author.username}\u000f> test message`;
    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should send attachment URL to IRC', function () {
    const attachmentUrl = 'https://image/url.jpg';
    const message = {
      content: '',
      mentions: { users: [] },
      attachments: createAttachments(attachmentUrl),
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    const expected = `<\u000304${message.author.username}\u000f> ${attachmentUrl}`;
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should send text message and attachment URL to IRC if both exist', function () {
    const text = 'Look at this cute cat picture!';
    const attachmentUrl = 'https://image/url.jpg';
    const message = {
      content: text,
      attachments: createAttachments(attachmentUrl),
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);

    ClientStub.prototype.say.should.have.been.calledWith(
      '#irc',
      `<\u000304${message.author.username}\u000f> ${text}`
    );

    const expected = `<\u000304${message.author.username}\u000f> ${attachmentUrl}`;
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should not send an empty text message with an attachment to IRC', function () {
    const message = {
      content: '',
      attachments: createAttachments('https://image/url.jpg'),
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);

    ClientStub.prototype.say.should.have.been.calledOnce;
  });

  it('should not send its own messages to irc', function () {
    const message = {
      author: {
        username: 'bot',
        id: this.bot.discord.user.id,
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.not.have.been.called;
  });

  it("should not send messages to irc if the channel isn't in the channel mapping", function () {
    const message = {
      channel: {
        name: 'wrongdiscord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.not.have.been.called;
  });

  it('should break mentions when parallelPingFix is enabled', function () {
    const newConfig = { ...config, parallelPingFix: true };
    this.setCustomBot(newConfig);

    const text = 'testmessage';
    const username = 'otherauthor';
    const brokenNickname = 'o\u200Btherauthor';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username,
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    // Wrap in colors:
    const expected = `<\u000304${brokenNickname}\u000f> ${text}`;
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should parse text from discord when sending messages', function () {
    const text = '<#1234>';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'test',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    // Wrap it in colors:
    const expected = `<\u000312${message.author.username}\u000f> #${message.channel.name}`;
    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should use #deleted-channel when referenced channel fails to exist', function () {
    const text = '<#1235>';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'test',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    // Discord displays "#deleted-channel" if channel doesn't exist (e.g. <#1235>)
    // Wrap it in colors:
    const expected = `<\u000312${message.author.username}\u000f> #deleted-channel`;
    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should convert user mentions from discord', function () {
    const message = {
      mentions: {
        users: [
          {
            id: 123,
            username: 'testuser',
          },
        ],
      },
      content: '<@123> hi',
      guild: this.guild,
    };

    this.bot.parseText(message).should.equal('@testuser hi');
  });

  it('should convert user nickname mentions from discord', function () {
    const message = {
      mentions: {
        users: [
          {
            id: 123,
            username: 'testuser',
          },
        ],
      },
      content: '<@!123> hi',
      guild: this.guild,
    };

    this.bot.parseText(message).should.equal('@testuser hi');
  });

  it('should convert twitch emotes from discord', function () {
    const message = {
      mentions: { users: [] },
      content: '<:SCGWat:230473833046343680>',
    };

    this.bot.parseText(message).should.equal(':SCGWat:');
  });

  it('should convert animated emoji from discord', function () {
    const message = {
      mentions: { users: [] },
      content: '<a:in_love:432887860270465028>',
    };

    this.bot.parseText(message).should.equal(':in_love:');
  });

  it('should convert user at-mentions from IRC', function () {
    const testUser = this.addUser({ username: 'testuser', id: '123' });

    const username = 'ircuser';
    const text = 'Hello, @testuser!';
    const expected = `**<${username}>** Hello, <@${testUser.id}>!`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert user colon-initial mentions from IRC', function () {
    const testUser = this.addUser({ username: 'testuser', id: '123' });

    const username = 'ircuser';
    const text = 'testuser: hello!';
    const expected = `**<${username}>** <@${testUser.id}> hello!`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert user comma-initial mentions from IRC', function () {
    const testUser = this.addUser({ username: 'testuser', id: '123' });

    const username = 'ircuser';
    const text = 'testuser, hello!';
    const expected = `**<${username}>** <@${testUser.id}> hello!`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should not convert user initial mentions from IRC mid-message', function () {
    this.addUser({ username: 'testuser', id: '123' });

    const username = 'ircuser';
    const text = 'Hi there testuser, how goes?';
    const expected = `**<${username}>** Hi there testuser, how goes?`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should not convert user at-mentions from IRC if such user does not exist', function () {
    const username = 'ircuser';
    const text = 'See you there @5pm';
    const expected = `**<${username}>** See you there @5pm`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should not convert user initial mentions from IRC if such user does not exist', function () {
    const username = 'ircuser';
    const text = 'Agreed, see you then.';
    const expected = `**<${username}>** Agreed, see you then.`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert multiple user mentions from IRC', function () {
    const testUser = this.addUser({ username: 'testuser', id: '123' });
    const anotherUser = this.addUser({ username: 'anotheruser', id: '124' });

    const username = 'ircuser';
    const text =
      'Hello, @testuser and @anotheruser, was our meeting scheduled @5pm?';
    const expected =
      `**<${username}>** Hello, <@${testUser.id}> and <@${anotherUser.id}>,` +
      ' was our meeting scheduled @5pm?';

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert emoji mentions from IRC', function () {
    this.addEmoji({ id: '987', name: 'testemoji', require_colons: true });

    const username = 'ircuser';
    const text =
      "Here is a broken :emojitest:, a working :testemoji: and another :emoji: that won't parse";
    const expected = `**<${username}>** Here is a broken :emojitest:, a working <:testemoji:987> and another :emoji: that won't parse`;
    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert channel mentions from IRC', function () {
    this.guild.addTextChannel({ id: '1235', name: 'testchannel' });
    this.guild.addTextChannel({ id: '1236', name: 'channel-compliqué' });
    const otherGuild = this.bot.discord.createGuildStub({ id: '2' });
    otherGuild.addTextChannel({ id: '1237', name: 'foreignchannel' });

    const username = 'ircuser';
    const text =
      "Here is a broken #channelname, a working #testchannel, #channel-compliqué, an irregular case #TestChannel and another guild's #foreignchannel";
    const expected = `**<${username}>** Here is a broken #channelname, a working <#1235>, <#1236>, an irregular case <#1235> and another guild's #foreignchannel`;
    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert newlines from discord', function () {
    const message = {
      mentions: { users: [] },
      content: 'hi\nhi\r\nhi\r',
    };

    this.bot.parseText(message).should.equal('hi hi hi ');
  });

  it('should hide usernames for commands to IRC', function () {
    const text = '!test command';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'test',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    ClientStub.prototype.say
      .getCall(0)
      .args.should.deep.equal(['#irc', 'Command sent from Discord by test:']);
    ClientStub.prototype.say.getCall(1).args.should.deep.equal(['#irc', text]);
  });

  it('should support multi-character command prefixes', function () {
    this.setCustomBot({ ...config, commandCharacters: ['@@'] });
    const text = '@@test command';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'test',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    ClientStub.prototype.say
      .getCall(0)
      .args.should.deep.equal(['#irc', 'Command sent from Discord by test:']);
    ClientStub.prototype.say.getCall(1).args.should.deep.equal(['#irc', text]);
  });

  it('should hide usernames for commands to Discord', function () {
    const username = 'ircuser';
    const text = '!command';

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub
      .getCall(0)
      .args.should.deep.equal(['Command sent from IRC by ircuser:']);
    this.sendStub.getCall(1).args.should.deep.equal([text]);
  });

  it('should use nickname instead of username when available', function () {
    const text = 'testmessage';
    const newConfig = { ...config, ircNickColor: false };
    this.setCustomBot(newConfig);
    const id = 'not bot id';
    const nickname = 'discord-nickname';
    this.guild.members.cache.set(id, { nickname });
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id,
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    const expected = `<${nickname}> ${text}`;
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should convert user nickname mentions from IRC', function () {
    const testUser = this.addUser({
      username: 'testuser',
      id: '123',
      nickname: 'somenickname',
    });

    const username = 'ircuser';
    const text = 'Hello, @somenickname!';
    const expected = `**<${username}>** Hello, ${testUser}!`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert username mentions from IRC even if nickname differs', function () {
    const testUser = this.addUser({
      username: 'testuser',
      id: '123',
      nickname: 'somenickname',
    });

    const username = 'ircuser';
    const text = 'Hello, @testuser!';
    const expected = `**<${username}>** Hello, ${testUser}!`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert username-discriminator mentions from IRC properly', function () {
    const user1 = this.addUser({
      username: 'user',
      id: '123',
      discriminator: '9876',
    });
    const user2 = this.addUser({
      username: 'user',
      id: '124',
      discriminator: '5555',
      nickname: 'secondUser',
    });

    const username = 'ircuser';
    const text = 'hello @user#9876 and @user#5555 and @fakeuser#1234';
    const expected = `**<${username}>** hello ${user1} and ${user2} and @fakeuser#1234`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert role mentions from discord', function () {
    this.addRole({ name: 'example-role', id: '12345' });
    const text = '<@&12345>';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'test',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.parseText(message).should.equal('@example-role');
  });

  it('should use @deleted-role when referenced role fails to exist', function () {
    this.addRole({ name: 'example-role', id: '12345' });

    const text = '<@&12346>';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'test',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    // Discord displays "@deleted-role" if role doesn't exist (e.g. <@&12346>)
    this.bot.parseText(message).should.equal('@deleted-role');
  });

  it('should convert role mentions from IRC if role mentionable', function () {
    const testRole = this.addRole({
      name: 'example-role',
      id: '12345',
      mentionable: true,
    });

    const username = 'ircuser';
    const text = 'Hello, @example-role!';
    const expected = `**<${username}>** Hello, <@&${testRole.id}>!`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should not convert role mentions from IRC if role not mentionable', function () {
    this.addRole({ name: 'example-role', id: '12345', mentionable: false });

    const username = 'ircuser';
    const text = 'Hello, @example-role!';
    const expected = `**<${username}>** Hello, @example-role!`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert overlapping mentions from IRC properly and case-insensitively', function () {
    const user = this.addUser({ username: 'user', id: '111' });
    const nickUser = this.addUser({
      username: 'user2',
      id: '112',
      nickname: 'userTest',
    });
    const nickUserCase = this.addUser({
      username: 'user3',
      id: '113',
      nickname: 'userTEST',
    });
    const role = this.addRole({
      name: 'userTestRole',
      id: '12345',
      mentionable: true,
    });

    const username = 'ircuser';
    const text =
      'hello @User, @user, @userTest, @userTEST, @userTestRole and @usertestrole';
    const expected = `**<${username}>** hello ${user}, ${user}, ${nickUser}, ${nickUserCase}, ${role} and ${role}`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should convert partial matches from IRC properly', function () {
    const user = this.addUser({ username: 'user', id: '111' });
    const longUser = this.addUser({ username: 'user-punc', id: '112' });
    const nickUser = this.addUser({
      username: 'user2',
      id: '113',
      nickname: 'nick',
    });
    const nickUserCase = this.addUser({
      username: 'user3',
      id: '114',
      nickname: 'NiCK',
    });
    const role = this.addRole({ name: 'role', id: '12345', mentionable: true });

    const username = 'ircuser';
    const text =
      "@user-ific @usermore, @user's friend @user-punc, @nicks and @NiCKs @roles";
    const expected = `**<${username}>** ${user}-ific ${user}more, ${user}'s friend ${longUser}, ${nickUser}s and ${nickUserCase}s ${role}s`;

    this.bot.sendToDiscord(username, '#irc', text);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should successfully send messages with default config', function () {
    this.setCustomBot(configMsgFormatDefault);

    this.bot.sendToDiscord('testuser', '#irc', 'test message');
    this.sendStub.should.have.been.calledOnce;
    const message = {
      content: 'test message',
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    this.sendStub.should.have.been.calledOnce;
  });

  it('should not replace unmatched patterns', function () {
    const format = {
      discord: '{$unmatchedPattern} stays intact: {$author} {$text}',
    };
    this.setCustomBot({ ...configMsgFormatDefault, format });

    const username = 'testuser';
    const msg = 'test message';
    const expected = `{$unmatchedPattern} stays intact: ${username} ${msg}`;
    this.bot.sendToDiscord(username, '#irc', msg);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should respect custom formatting for Discord', function () {
    const format = {
      discord: '<{$author}> {$ircChannel} => {$discordChannel}: {$text}',
    };
    this.setCustomBot({ ...configMsgFormatDefault, format });

    const username = 'test';
    const msg = 'test @user <#1234>';
    const expected = `<test> #irc => #discord: ${msg}`;
    this.bot.sendToDiscord(username, '#irc', msg);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should successfully send messages with default config', function () {
    this.setCustomBot(configMsgFormatDefault);

    this.bot.sendToDiscord('testuser', '#irc', 'test message');
    this.sendStub.should.have.been.calledOnce;
    const message = {
      content: 'test message',
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    this.sendStub.should.have.been.calledOnce;
  });

  it('should not replace unmatched patterns', function () {
    const format = {
      discord: '{$unmatchedPattern} stays intact: {$author} {$text}',
    };
    this.setCustomBot({ ...configMsgFormatDefault, format });

    const username = 'testuser';
    const msg = 'test message';
    const expected = `{$unmatchedPattern} stays intact: ${username} ${msg}`;
    this.bot.sendToDiscord(username, '#irc', msg);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should respect custom formatting for regular Discord output', function () {
    const format = {
      discord: '<{$author}> {$ircChannel} => {$discordChannel}: {$text}',
    };
    this.setCustomBot({ ...configMsgFormatDefault, format });

    const username = 'test';
    const msg = 'test @user <#1234>';
    const expected = `<test> #irc => #discord: ${msg}`;
    this.bot.sendToDiscord(username, '#irc', msg);
    this.sendStub.should.have.been.calledWith(expected);
  });

  it('should respect custom formatting for commands in Discord output', function () {
    const format = {
      commandPrelude:
        '{$nickname} from {$ircChannel} sent command to {$discordChannel}:',
    };
    this.setCustomBot({ ...configMsgFormatDefault, format });

    const username = 'test';
    const msg = '!testcmd';
    const expected = 'test from #irc sent command to #discord:';
    this.bot.sendToDiscord(username, '#irc', msg);
    this.sendStub.getCall(0).args.should.deep.equal([expected]);
    this.sendStub.getCall(1).args.should.deep.equal([msg]);
  });

  it('should respect custom formatting for regular IRC output', function () {
    const format = {
      ircText: '<{$nickname}> {$discordChannel} => {$ircChannel}: {$text}',
    };
    this.setCustomBot({ ...configMsgFormatDefault, format });
    const message = {
      content: 'test message',
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'testauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };
    const expected = '<testauthor> #discord => #irc: test message';

    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should respect custom formatting for commands in IRC output', function () {
    const format = {
      commandPrelude:
        '{$nickname} from {$discordChannel} sent command to {$ircChannel}:',
    };
    this.setCustomBot({ ...configMsgFormatDefault, format });

    const text = '!testcmd';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'testauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };
    const expected = 'testauthor from #discord sent command to #irc:';

    this.bot.sendToIRC(message);
    ClientStub.prototype.say
      .getCall(0)
      .args.should.deep.equal(['#irc', expected]);
    ClientStub.prototype.say.getCall(1).args.should.deep.equal(['#irc', text]);
  });

  it('should respect custom formatting for attachment URLs in IRC output', function () {
    const format = {
      urlAttachment:
        '<{$nickname}> {$discordChannel} => {$ircChannel}, attachment: {$attachmentURL}',
    };
    this.setCustomBot({ ...configMsgFormatDefault, format });

    const attachmentUrl = 'https://image/url.jpg';
    const message = {
      content: '',
      mentions: { users: [] },
      attachments: createAttachments(attachmentUrl),
      channel: {
        name: 'discord',
      },
      author: {
        username: 'otherauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    const expected = `<otherauthor> #discord => #irc, attachment: ${attachmentUrl}`;
    ClientStub.prototype.say.should.have.been.calledWith('#irc', expected);
  });

  it('should not bother with command prelude if falsy', function () {
    const format = { commandPrelude: null };
    this.setCustomBot({ ...configMsgFormatDefault, format });

    const text = '!testcmd';
    const message = {
      content: text,
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'testauthor',
        id: 'not bot id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.have.been.calledOnce;
    ClientStub.prototype.say.getCall(0).args.should.deep.equal(['#irc', text]);

    const username = 'test';
    const msg = '!testcmd';
    this.bot.sendToDiscord(username, '#irc', msg);
    this.sendStub.should.have.been.calledOnce;
    this.sendStub.getCall(0).args.should.deep.equal([msg]);
  });

  it('should create webhooks clients for each webhook url in the config', function () {
    this.bot.webhooks.should.have.property('#withwebhook');
  });

  it('should extract id and token from webhook urls', function () {
    this.bot.webhooks['#withwebhook'].id.should.equal('id');
  });

  it('should find the matching webhook when it exists', function () {
    this.bot.findWebhook('#ircwebhook').should.not.equal(null);
  });

  context('with enabled Discord webhook', function () {
    this.beforeEach(function () {
      const newConfig = {
        ...config,
        webhooks: { '#discord': 'https://discord.com/api/webhooks/id/token' },
      };
      this.setCustomBot(newConfig);
    });

    it('should prefer webhooks to send a message', function () {
      this.bot.sendToDiscord('nick', '#irc', 'text');
      this.sendWebhookMessageStub.should.have.been.called;
    });

    it('pads too short usernames', function () {
      const text = 'message';
      this.bot.sendToDiscord('n', '#irc', text);
      this.sendWebhookMessageStub.should.have.been.calledWith(text, {
        username: 'n_',
        avatarURL: null,
        disableMentions: 'everyone',
      });
    });

    it('slices too long usernames', function () {
      const text = 'message';
      this.bot.sendToDiscord(
        '1234567890123456789012345678901234567890',
        '#irc',
        text
      );
      this.sendWebhookMessageStub.should.have.been.calledWith(text, {
        username: '12345678901234567890123456789012',
        avatarURL: null,
        disableMentions: 'everyone',
      });
    });

    it('does not ping everyone if user lacks permission', function () {
      const text = 'message';
      const permission =
        discord.Permissions.FLAGS.VIEW_CHANNEL +
        discord.Permissions.FLAGS.SEND_MESSAGES;
      this.bot.discord.channels.cache
        .get('1234')
        .setPermissionStub(
          this.bot.discord.user,
          new discord.Permissions(permission)
        );
      this.bot.sendToDiscord('nick', '#irc', text);
      this.sendWebhookMessageStub.should.have.been.calledWith(text, {
        username: 'nick',
        avatarURL: null,
        disableMentions: 'everyone',
      });
    });

    it('sends @everyone messages if the bot has permission to do so', function () {
      const text = 'message';
      const permission =
        discord.Permissions.FLAGS.VIEW_CHANNEL +
        discord.Permissions.FLAGS.SEND_MESSAGES +
        discord.Permissions.FLAGS.MENTION_EVERYONE;
      this.bot.discord.channels.cache
        .get('1234')
        .setPermissionStub(
          this.bot.discord.user,
          new discord.Permissions(permission)
        );
      this.bot.sendToDiscord('nick', '#irc', text);
      this.sendWebhookMessageStub.should.have.been.calledWith(text, {
        username: 'nick',
        avatarURL: null,
        disableMentions: 'none',
      });
    });

    const setupUser = (base) => {
      const userObj = { id: 123, username: 'Nick', avatar: 'avatarURL' };
      const memberObj = { nickname: 'Different' };
      base.addUser(userObj, memberObj);
    };

    const setupCommonPair = (base) => {
      const userObj1 = { id: 124, username: 'common', avatar: 'avatarURL' };
      const userObj2 = { id: 125, username: 'diffUser', avatar: 'avatarURL' };
      const memberObj1 = { nickname: 'diffNick' };
      const memberObj2 = { nickname: 'common' };
      base.addUser(userObj1, memberObj1);
      base.addUser(userObj2, memberObj2);
    };

    context('when matching avatars', function () {
      this.beforeEach(function () {
        setupUser(this);
      });

      it("should match a user's username", function () {
        this.bot
          .getDiscordAvatar('Nick', '#irc')
          .should.equal('/avatars/123/avatarURL.png?size=128');
      });

      it("should match a user's username case insensitively", function () {
        this.bot
          .getDiscordAvatar('nick', '#irc')
          .should.equal('/avatars/123/avatarURL.png?size=128');
      });

      it("should match a user's nickname", function () {
        this.bot
          .getDiscordAvatar('Different', '#irc')
          .should.equal('/avatars/123/avatarURL.png?size=128');
      });

      it("should match a user's nickname case insensitively", function () {
        this.bot
          .getDiscordAvatar('different', '#irc')
          .should.equal('/avatars/123/avatarURL.png?size=128');
      });

      it("should only return matching users' avatars", function () {
        expect(this.bot.getDiscordAvatar('other', '#irc')).to.equal(null);
      });

      it('should return no avatar when there are multiple matches', function () {
        setupCommonPair(this);
        this.bot.getDiscordAvatar('diffUser', '#irc').should.not.equal(null);
        this.bot.getDiscordAvatar('diffNick', '#irc').should.not.equal(null);
        expect(this.bot.getDiscordAvatar('common', '#irc')).to.equal(null);
      });

      it('should handle users without nicknames', function () {
        const userObj = {
          id: 124,
          username: 'nickless',
          avatar: 'nickless-avatar',
        };
        const memberObj = {};
        this.addUser(userObj, memberObj);
        this.bot
          .getDiscordAvatar('nickless', '#irc')
          .should.equal('/avatars/124/nickless-avatar.png?size=128');
      });

      it('should handle users without avatars', function () {
        const userObj = { id: 124, username: 'avatarless' };
        const memberObj = {};
        this.addUser(userObj, memberObj);
        expect(this.bot.getDiscordAvatar('avatarless', '#irc')).to.equal(null);
      });
    });

    context('when matching avatars with fallback URL', function () {
      this.beforeEach(function () {
        const newConfig = {
          ...config,
          webhooks: { '#discord': 'https://discord.com/api/webhooks/id/token' },
          format: { webhookAvatarURL: 'avatarFrom/{$nickname}' },
        };
        this.setCustomBot(newConfig);

        setupUser(this);
      });

      it("should use a matching user's avatar", function () {
        this.bot
          .getDiscordAvatar('Nick', '#irc')
          .should.equal('/avatars/123/avatarURL.png?size=128');
        this.bot
          .getDiscordAvatar('nick', '#irc')
          .should.equal('/avatars/123/avatarURL.png?size=128');
        this.bot
          .getDiscordAvatar('Different', '#irc')
          .should.equal('/avatars/123/avatarURL.png?size=128');
        this.bot
          .getDiscordAvatar('different', '#irc')
          .should.equal('/avatars/123/avatarURL.png?size=128');
      });

      it('should use fallback without matching user', function () {
        this.bot
          .getDiscordAvatar('other', '#irc')
          .should.equal('avatarFrom/other');
      });

      it('should use fallback when there are multiple matches', function () {
        setupCommonPair(this);
        this.bot
          .getDiscordAvatar('diffUser', '#irc')
          .should.equal('/avatars/125/avatarURL.png?size=128');
        this.bot
          .getDiscordAvatar('diffNick', '#irc')
          .should.equal('/avatars/124/avatarURL.png?size=128');
        this.bot
          .getDiscordAvatar('common', '#irc')
          .should.equal('avatarFrom/common');
      });

      it('should use fallback for users without avatars', function () {
        const userObj = { id: 124, username: 'avatarless' };
        const memberObj = {};
        this.addUser(userObj, memberObj);
        this.bot
          .getDiscordAvatar('avatarless', '#irc')
          .should.equal('avatarFrom/avatarless');
      });
    });
  });

  it('should not send messages to Discord if IRC user is ignored', function () {
    this.bot.sendToDiscord('irc_ignored_user', '#irc', 'message');
    this.sendStub.should.not.have.been.called;
  });

  it('should not send messages to IRC if Discord user is ignored', function () {
    const message = {
      content: 'text',
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'discord_ignored_user',
        id: 'some id',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.not.have.been.called;
  });

  it('should not send messages to IRC if Discord user is ignored by id', function () {
    const message = {
      content: 'text',
      mentions: { users: [] },
      channel: {
        name: 'discord',
      },
      author: {
        username: 'vasya_pupkin',
        id: '4499',
      },
      guild: this.guild,
    };

    this.bot.sendToIRC(message);
    ClientStub.prototype.say.should.not.have.been.called;
  });
});

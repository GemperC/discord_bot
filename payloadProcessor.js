// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits } = require("discord.js");
const token = process.env.DISCORD_TOKEN;
const readline = require("readline");

//
const { Octokit, App } = require("octokit");
const { exit, env } = require("process");
const { getRandomColor } = require("./utils.js");

function newPostFromIssue(client, issue, comment) {
  // Check if the issue is already synced with Discord
  if (issue.labels.find((label) => label.name === "synced-with-discord")) {
    console.log("Issue already synced");
    client.destroy();
    return;
  }

  // When the client is ready, start processing
  client.once(Events.ClientReady, async (readyClient) => {
    const guild = readyClient.guilds.cache.get(env.DISCORD_SERVER_ID);
    const channels = guild.channels.cache;
    const messageFetchPromises = [];

    // Fetch messages from appropriate channels
    channels.forEach((channel) => {
      if (isEligibleChannel(channel)) {
        messageFetchPromises.push(processChannelMessages(channel, comment));
      }
    });

    // Wait for all messages to be processed
    await Promise.all(messageFetchPromises);
    console.log("Processing complete");
    client.destroy();
  });
}

// Helper function to determine if a channel is eligible
function isEligibleChannel(channel) {
  return (
    channel.isThread() &&
    !channel.archived &&
    channel.parentId === env.DISCORD_INPUT_FORUM_CHANNEL_ID
  );
}

// Function to process messages in a channel
async function processChannelMessages(channel, comment) {
  const messages = await channel.messages.fetch();
  messages.forEach((message) => {
    if (shouldSyncMessage(message, issue.number.toString())) {
      console.log(`Syncing with issue #${issue.number}`);
      const newMessage = createMessagePayload(comment, channel.id);
      const thread = channel.client.channels.cache.get(channel.id);
      thread.send(newMessage);
    }
  });
}

// Helper function to check if a message should be synced
function shouldSyncMessage(message, issueNumber) {
  return (
    (message.author.bot || isMessageFromAdmin(message)) &&
    message.cleanContent.includes(`\`synced with issue #${issueNumber}\``)
  );
}

// Function to check if a message is from an admin
function isMessageFromAdmin(message) {
  return message.author.username === env.DISCORD_ADMIN_USERNAME;
  // Further implementation needed to check admin status
}

// Function to create the message payload
function createMessagePayload(comment, channel_id) {
  return {
    threadId: channel_id,
    embeds: [
      {
        description: comment.body,
        url: comment.html_url,
        color: parseInt(getRandomColor(comment.user.login), 16),
        author: {
          name: comment.user.login,
          icon_url: comment.user.avatar_url,
          url: comment.user.html_url,
        },
      },
    ],
  };
}

function process(payload) {
  console.log(payload.event.action);
  const client = new Client({
    intents: [
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
    ],
  });
  client.login(token);

  if (payload.event.action === "created") {
    newPostFromIssue(client, payload.event.issue, payload.event.comment);
    //check if labels include "synced-with-discord"
  }
  if (payload.event.action === "opened") {
    client.once(Events.ClientReady, (readyClient) => {
      console.log(
        "client ready with channel " + env.DISCORD_INPUT_FORUM_CHANNEL_ID
      );
      readyClient.channels
        .fetch(env.DISCORD_INPUT_FORUM_CHANNEL_ID)
        .then((channel) => {
          console.log(`New issue ${channel}`);
          let newMessage = {
            content: `\`synced with issue #${payload.event.issue.number}\` [follow on github](${payload.event.issue.html_url})`,
            embeds: [
              {
                title: `#${payload.event.issue.number} ${payload.event.issue.title}`,
                description: payload.event.issue.body,
                url: payload.event.issue.html_url,
                color: parseInt(
                  getRandomColor(payload.event.issue.user.login),
                  16
                ),
                author: {
                  name: payload.event.issue.user.login,
                  icon_url: payload.event.issue.user.avatar_url,
                  url: payload.event.issue.user.html_url,
                },
              },
            ],
          };
          channel.threads.create({
            name: payload.event.issue.title,
            message: newMessage,
          });
          client.destroy();
        });
    });
  }
}

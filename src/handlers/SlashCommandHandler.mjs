import { Collection, PermissionFlagsBits } from "discord.js";
import {
  cooldownCategories,
  cooldownCategoriesHigh,
  cooldownCommands,
  cooldownCommandsHigh,
  defaultCooldownMs,
  defaultCooldownMsHigh,
  maximumCoolDownCommands
} from "../data/Cooldowns.mjs";

/** 
 * Handles slash command interactions.
 * @param {import("../cores/BotClient.mjs").BotClient} client - The bot client instance.
 * @param {import("discord.js").CommandInteraction} interaction - The slash command interaction.
 */
export async function slashCommandHandler(client, interaction) {
  if (!client.utils.perms.checkPerms(interaction.channel, [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
    return interaction.reply({
      ephemeral: true,
      content: `I can't view this channel, or I can't send messages in this channel`
    });
  }

  const slashCmd = client.commands.get(parseSlashCommandKey(interaction));

  if (!client.utils.perms.checkPerms(interaction.channel, [PermissionFlagsBits.EmbedLinks])) {
    return interaction.reply({
      ephemeral: true,
      content: `I need the Permission, to Embed-Links in this Channel`
    });
  }

  if (slashCmd) {
    try {
      if (!(await checkCommand(client, slashCmd, interaction))) return;

      await slashCmd.execute(client, interaction);
    } catch (e) {
      client.logger.error(e);
      const content = `**Something went wrong while executing \`${slashCmd?.name || "???"}\`:**\`\`\`\n${String(e?.message ?? e).substring(0, 500)}\n\`\`\``.substring(0, 1000);
      if (interaction.replied) {
        interaction.channel.send({ content }).catch(() => null);
      } else {
        interaction.reply({ content, ephemeral: true }).catch(() => {
          interaction.channel.send({ content }).catch(() => null);
        });
      }
    }
  }
}

/** 
 * Parses the slash command interaction into a unique key for command retrieval.
 * @param {import("discord.js").CommandInteraction} interaction - The slash command interaction.
 * @returns {string} - A unique key for the command.
 */
export function parseSlashCommandKey(interaction) {
  const keys = ["slashcmd", interaction.commandName];
  if (interaction.options._subcommand) {
    keys.push(`${interaction.options._subcommand}`);
    keys[0] = "subcmd";
  }
  if (interaction.options._group) {
    keys.splice(1, 0, `${interaction.options._group}`);
    keys[0] = "groupcmd";
  }
  return keys.join("_");
}

/** 
 * Validates the command and checks for permission or cooldown requirements.
 * @param {import("../cores/BotClient.mjs").BotClient} client - The bot client instance.
 * @param {object} command - The command object.
 * @param {import("discord.js").CommandInteraction} ctx - The interaction context.
 * @param {object} extras - Additional options, such as skipping cooldown checks.
 * @returns {Promise<boolean>} - Whether the command passes validation.
 */
export async function checkCommand(client, command, ctx, ...extras) {
  const { dontCheckCooldown } = extras?.[0] || {};

  if (command.guildOnly && !ctx.guild) {
    return await ctx.reply({
      ephemeral: true,
      embeds: [
        client.embed.create({
          title: "Guilds Only",
          description: ">>> You can use this Command only in a Guilds",
          type: "error"
        }),
      ]
    }).catch(() => null), false;
  }

  if (command.mustPermissions?.length) {
    if (
      ctx.user.id !== ctx.guild?.ownerId &&
      !ctx?.member?.permissions?.has?.(PermissionFlagsBits.Administrator) &&
      command.mustPermissions.some(x => !ctx?.member?.permissions?.has?.(x))
    ) {
      await ctx.reply({
        ephemeral: true,
        embeds: [
          client.embed.create({
            title: "You need __all__ of these permissions:",
            description: `>>> ${new PermissionsBitField(command.mustPermissions).toArray().map(x => `\`${x}\``).join(", ")}`,
            type: "error",
          }),
        ],
      }).catch(() => null);
      return false;
    }
  }

  if (command.allowedPermissions?.length) {
    if (
      ctx.user.id !== ctx.guild?.ownerId &&
      !ctx?.member?.permissions?.has?.(PermissionFlagsBits.Administrator) &&
      !command.allowedPermissions.some(x => ctx?.member?.permissions?.has?.(x))
    ) {
      await ctx.reply({
        ephemeral: true,
        embeds: [
          client.embed.create({
            title: "You need __at least one__ of these permissions:",
            description: `>>> ${new PermissionsBitField(command.allowedPermissions).toArray().map(x => `\`${x}\``).join(", ")}`,
            type: "error",
          }),
        ],
      }).catch(() => null);
      return false;
    }
  }

  if (!dontCheckCooldown && isOnCooldown(client, command, ctx)) return false;

  const developers = client.config.developers;
  if (command.developerOnly && !developers.includes(ctx.user.id)) {
    await ctx.reply({
      ephemeral: true,
      embeds: [
        client.embed.create({
          title: "This command is __developer only__!",
          description: `>>> Only bot developers can use this command.`,
          type: "error",
        }),
      ],
    }).catch(() => null);
    return false;
  }

  return true;
}

/**
 * Checks if the command is on cooldown for the user, guild, or globally.
 * @param {import("../cores/BotClient.mjs").BotClient} client - The bot client instance.
 * @param {object} command - The command object.
 * @param {import("discord.js").CommandInteraction} ctx - The interaction context.
 * @returns {boolean} - Whether the command is on cooldown.
 */
export function isOnCooldown(client, command, ctx) {
  const [userId, guildId] = [ctx.user.id, ctx.guild.id];
  if (!client.cooldowns.user.get(userId)) client.cooldowns.user.set(userId, new Collection());
  if (!client.cooldowns.guild.get(guildId)) client.cooldowns.guild.set(guildId, new Collection());
  if (!client.cooldowns.global.get(userId)) client.cooldowns.global.set(userId, []);

  const defaultCooldown =
    cooldownCategoriesHigh.includes(command.category) || cooldownCommandsHigh.includes(command.name)
      ? defaultCooldownMsHigh
      : cooldownCategories.includes(command.category) || cooldownCommands.includes(command.name)
        ? defaultCooldownMs
        : 0;

  if (command.cooldown?.user) {
    const userCooldowns = client.cooldowns.user.get(userId);
    const commandCooldown = userCooldowns.get(command.name) || 0;
    if (commandCooldown > Date.now()) {
      ctx.reply({
        ephemeral: true,
        embeds: [
          client.embed.create({
            title: "Slow down!",
            description: `>>> You can use this command again in \`${client.utils.time.onlySecondDuration(commandCooldown - Date.now())}\`.`,
            type: "warning",
          }),
        ],
      }).catch(() => null);
      return true;
    }
    userCooldowns.set(command.name, Date.now() + (command.cooldown?.user || 0));
    client.cooldowns.user.set(userId, userCooldowns);
  }

  if (command.cooldown?.guild ?? defaultCooldown) {
    const guildCooldowns = client.cooldowns.guild.get(guildId);
    const commandCooldown = guildCooldowns.get(command.name) || 0;
    if (commandCooldown > Date.now()) {
      ctx.reply({
        ephemeral: true,
        embeds: [
          client.embed.create({
            title: "Slow down!",
            description: `>>> This guild can use this command again in \`${client.utils.time.onlySecondDuration(commandCooldown - Date.now())}\`.`,
            type: "warning",
          }),
        ],
      }).catch(() => null);
      return true;
    }
    guildCooldowns.set(command.name, Date.now() + (command.cooldown?.guild ?? defaultCooldown));
    client.cooldowns.guild.set(guildId, guildCooldowns);
  }

  const globalCooldowns = client.cooldowns.global.get(userId);
  const allCooldowns = [...globalCooldowns, Date.now()].filter(x => (Date.now() - x) <= maximumCoolDownCommands.time);
  client.cooldowns.global.set(userId, allCooldowns);
  if (allCooldowns.length > maximumCoolDownCommands.amount) {
    ctx.reply({
      ephemeral: true,
      embeds: [
        client.embed.create({
          title: "Slow down!",
          description: `>>> You can only use ${maximumCoolDownCommands.amount} commands per ${maximumCoolDownCommands.time / 1000} seconds.`,
          type: "warning",
        }),
      ],
    }).catch(() => null);
    return true;
  }

  return false;
}

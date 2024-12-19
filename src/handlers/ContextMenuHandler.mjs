import { PermissionFlagsBits } from "discord.js";
import { checkCommand, parseSlashCommandKey } from "./SlashCommandHandler.mjs";

/** 
 * @param {import("../structures/BotClient.mjs").BotClient} client
 * @param {import("discord.js").CommandInteraction} interaction
*/
export async function contextMenuHandler(client, interaction) {

  if (!client.utils.perms.checkPerms(interaction.channel, [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
    return interaction.reply({
      ephemeral: true,
      content: `${client.DeezEmojis.error.str} I can't view this channel, or I can't send messages in this channel`
    });
  }
  const contextCmd = client.commands.get(parseSlashCommandKey(interaction, true));

  if (!client.utils.perms.checkPerms(interaction.channel, [PermissionFlagsBits.EmbedLinks])) {
    return interaction.reply({
      ephemeral: true,
      content: `I need the Permission, to Embed-Links in this Channel`
    });
  }

  if (contextCmd) {
    try {
      if (!(await checkCommand(client, contextCmd, interaction))) return;

      await contextCmd.execute(client, interaction);
    } catch (e) {
      client.logger.error(e);
      const content = `**Something went wrong while executing \`${contextCmd?.name || "???"}\`:**\`\`\`\n${String(e?.message ?? e).substring(0, 500)}\n\`\`\``.substring(0, 1000);
      if (interaction.replied) {
        interaction.channel.send({ content }).catch(() => null);
      } else {
        interaction.reply({ content, ephemeral: true }).catch(() => {
          interaction.channel.send({ content }).catch(() => null);
        })
      }
    }
  }
}
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

/**
 * Utility class for handling pagination in Discord interactions.
 */
export class Paginator {
  /**
   * @param {import('../cores/BotClient.mjs').BotClient} client - The bot client instance.
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * Paginate content with buttons for navigation.
   * @param {import('discord.js').CommandInteraction} interaction The interaction to reply to.
   * @param {Array<{content: string, embeds: import('discord.js').Embed[]} | string>} pages Array of pages to display.
   * @param {{ephemeral?: boolean, timeout?: number}} options Options for pagination.
   */
  async paginate(interaction, pages, options = {}) {
    const { ephemeral = false, timeout = 60000 } = options;

    if (!pages || !pages.length) {
      throw new Error("Pages array cannot be empty.");
    }

    let currentPage = 0;

    /**
     * Creates the pagination buttons.
     * @param {boolean} disabled Whether the buttons should be disabled.
     * @returns {ActionRowBuilder} The row containing the pagination buttons.
     */
    const createButtons = (disabled = false) => {
      const buttons = [
        new ButtonBuilder()
          .setCustomId('1')
          .setEmoji('◀️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('2')
          .setEmoji('🏠')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('3')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('4')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || pages.length <= 5),
        new ButtonBuilder()
          .setCustomId('5')
          .setEmoji('⏹')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ];

      if (pages.length > 5) {
        buttons[3].setEmoji('🔢');
      } else {
        buttons[3].setLabel("");
      }

      return new ActionRowBuilder().addComponents(buttons);
    };

    /**
     * Retrieves the content and embeds for a given page index.
     * @param {number} page The page index.
     * @returns {object} The content and embeds for the page.
     */
    const getPageContent = (page) => {
      const pageContent = pages[page];
      if (typeof pageContent === "string") {
        return { content: pageContent, embeds: [] };
      }
      if (pageContent.embeds || pageContent.content) {
        return {
          content: pageContent.content || null,
          embeds: pageContent.embeds || []
        };
      }
      throw new Error("Each page must be either a string or an object containing 'content' and/or 'embeds'.");
    };

    const initialPage = getPageContent(currentPage);
    const message = await interaction.reply({
      content: initialPage.content,
      embeds: initialPage.embeds,
      components: [createButtons()],
      ephemeral,
    });

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: timeout,
    });

    collector.on('collect', async (buttonInteraction) => {
      switch (buttonInteraction.customId) {
        case '1':
          currentPage = currentPage > 0 ? currentPage - 1 : 0;
          break;
        case '2':
          currentPage = 0;
          break;
        case '3':
          currentPage = currentPage < pages.length - 1 ? currentPage + 1 : pages.length - 1;
          break;
        case '4': {
          if (pages.length <= 5) {
            await buttonInteraction.reply({ content: "Go to Page is disabled for less than 6 pages.", ephemeral: true });
            return;
          }

          const modal = new ModalBuilder()
            .setCustomId('6')
            .setTitle('Go to Page')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('7')
                  .setLabel('Page Number')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder(`1 - ${pages.length}`)
                  .setRequired(true)
              )
            );

          await buttonInteraction.showModal(modal);

          const modalSubmit = await interaction.awaitModalSubmit({
            filter: (modalInteraction) => modalInteraction.customId === '6',
            time: timeout,
          });

          const pageNumber = parseInt(modalSubmit.fields.getTextInputValue('7'), 10);
          if (pageNumber && pageNumber >= 1 && pageNumber <= pages.length) {
            currentPage = pageNumber - 1;
            const newPage = getPageContent(currentPage);
            await modalSubmit.update({
              content: newPage.content,
              embeds: newPage.embeds,
              components: [createButtons()],
            });
          } else {
            await modalSubmit.reply({
              content: `Invalid page number. Please choose a number between 1 and ${pages.length}.`,
              ephemeral: true,
            });
          }
          return;
        }
        case '5':
          collector.stop();
          await buttonInteraction.update({
            components: [createButtons(true)],
          });
          return;
      }

      const newPage = getPageContent(currentPage);
      await buttonInteraction.update({
        content: newPage.content,
        embeds: newPage.embeds,
        components: [createButtons()],
      });
    });

    collector.on('end', () => {
      if (!message.editable) return;
      message.edit({
        components: [createButtons(true)],
      });
    });
  }
}

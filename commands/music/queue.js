const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionType
} = require("discord.js");
const { parseTimeString } = require("../../utils/parseTimeString");
const { logger } = require("../../utils/logger");
const { msToTime } = require("../../utils/msToTime");
const { getPremiumUsers } = require("../../utils/premiumManager");
const config = require("../../config");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Manage the music queue")
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("View the queue and currently playing song")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Clear all songs in the queue (except the currently playing song)")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("move")
                .setDescription("Move a song to a different position in the queue")
                .addIntegerOption(opt =>
                    opt.setName("from")
                        .setDescription("The number of the song you want to move")
                        .setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName("to")
                        .setDescription("The position to move the song to")
                        .setRequired(true))
        ),

    async run({ interaction, client }) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "view":
                await handleView(interaction, client);
                break;
            case "clear":
                await handleClear(interaction, client);
                break;
            case "move":
                await handleMove(interaction, client);
                break;
        }
    },

    options: {
        inVoice: true,
        sameVoice: true,
        blacklist: true,
        group: true
    }
};

async function handleView(interaction, client) {
    try {
        await interaction.deferReply();

        const player = client.riffy.players.get(interaction.guildId);
        if (!player || !player.queue || !player.queue.length) {
            return interaction.editReply({
                content: "`❌` | No songs are currently playing.",
                ephemeral: true
            });
        }

        const songs = player.queue;
        const songsPerPage = 10;
        const totalPages = Math.ceil(songs.length / songsPerPage);
        let currentPage = 0;

        const generateEmbed = (page) => {
            const start = page * songsPerPage;
            const end = Math.min(start + songsPerPage, songs.length);
            const sliced = songs.slice(start, end);

            return new EmbedBuilder()
                .setColor(0x8e44ad)
                .setTitle("🎵 Music Queue")
                .setDescription(
                    sliced.map((track, index) =>
                        `\`${start + index + 1}.\` [${track.info.title}](${track.info.uri}) - \`${msToTime(track.info.length)}\``
                    ).join("\n")
                )
                .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
        };

        const getButtons = async () => {
            const isDev = interaction.user.id === "1373949053414670396";
            const premiumUsers = await getPremiumUsers();
            const isPremium = isDev || premiumUsers.includes(interaction.user.id);

            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('first_page').setLabel('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
                new ButtonBuilder().setCustomId('prev_page').setLabel('⬅️').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0),
                new ButtonBuilder().setCustomId('shuffle').setLabel('🔀').setStyle(ButtonStyle.Success).setDisabled(!isPremium),
                new ButtonBuilder().setCustomId('next_page').setLabel('➡️').setStyle(ButtonStyle.Primary).setDisabled(currentPage === totalPages - 1),
                new ButtonBuilder().setCustomId('last_page').setLabel('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages - 1)
            );
        };

        const getActions = () => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('clear_queue').setLabel('🗑️ Clear').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('move_queue').setLabel('📦 Move').setStyle(ButtonStyle.Secondary)
        );

        const message = await interaction.editReply({
            embeds: [generateEmbed(currentPage)],
            components: [await getButtons(), getActions()],
            fetchReply: true
        });

        const filter = i => i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: parseTimeString("60s") });

        collector.on("collect", async (btn) => {
            switch (btn.customId) {
                case "first_page": currentPage = 0; break;
                case "prev_page": currentPage = Math.max(currentPage - 1, 0); break;
                case "next_page": currentPage = Math.min(currentPage + 1, totalPages - 1); break;
                case "last_page": currentPage = totalPages - 1; break;

                case "shuffle": {
                    for (let i = player.queue.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [player.queue[i], player.queue[j]] = [player.queue[j], player.queue[i]];
                    }

                    await btn.reply({ content: "`🔀` | Queue has been shuffled!", ephemeral: true });
                    currentPage = 0;
                    break;
                }

                case "clear_queue":
                    player.queue = [];
                    await btn.reply({ content: "`🗑️` | Queue cleared.", ephemeral: true });
                    break;

                case "move_queue":
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('select_move')
                        .setPlaceholder('Choose song to move')
                        .addOptions(
                            player.queue.slice(0, 25).map((track, i) => ({
                                label: track.info.title.slice(0, 100),
                                value: String(i)
                            }))
                        );

                    await btn.reply({
                        content: '🎯 Select the song you want to move:',
                        components: [new ActionRowBuilder().addComponents(selectMenu)],
                        ephemeral: true
                    });
                    return; // Skip embed update
            }

            await btn.update({
                embeds: [generateEmbed(currentPage)],
                components: [await getButtons(), getActions()]
            });
        });

        interaction.client.on('interactionCreate', async (selectInt) => {
            if (!selectInt.isStringSelectMenu()) return;
            if (selectInt.customId !== "select_move") return;
            if (selectInt.user.id !== interaction.user.id) return;

            const selectedIndex = parseInt(selectInt.values[0]);
            const modal = new ModalBuilder()
                .setCustomId(`move_modal_${selectedIndex}`)
                .setTitle("Move Song to Position")
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("new_position")
                            .setLabel("Enter new position (1 - " + player.queue.length + ")")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );

            await selectInt.showModal(modal);
        });

        interaction.client.on('interactionCreate', async (modalInt) => {
            if (modalInt.type !== InteractionType.ModalSubmit) return;
            if (!modalInt.customId.startsWith("move_modal_")) return;
            if (modalInt.user.id !== interaction.user.id) return;

            const fromIndex = parseInt(modalInt.customId.split("_")[2]);
            const toIndex = parseInt(modalInt.fields.getTextInputValue("new_position")) - 1;

            if (isNaN(toIndex) || toIndex < 0 || toIndex >= player.queue.length) {
                return modalInt.reply({ content: "`❌` | Invalid position!", ephemeral: true });
            }

            const [song] = player.queue.splice(fromIndex, 1);
            player.queue.splice(toIndex, 0, song);

            await modalInt.reply({ content: `✅ | Moved **${song.info.title}** to position \`${toIndex + 1}\`.`, ephemeral: true });
        });

        collector.on("end", () => {
            message.edit({ components: [] }).catch(() => {});
        });

    } catch (err) {
        logger(err, "error");
        return interaction.editReply({
            content: `\`❌\` | An error occurred: ${err.message}`,
            ephemeral: true
        });
    }
}

async function handleClear(interaction, client) {
    try {
        const player = client.riffy.players.get(interaction.guildId);
        if (!player || !player.queue || player.queue.length === 0) {
            return interaction.reply({ content: "`❌` | Nothing to clear.", ephemeral: true });
        }

        player.queue = [];

        return interaction.reply({ content: "`🗑️` | Queue has been cleared.", ephemeral: true });

    } catch (err) {
        logger(err, "error");
        return interaction.reply({ content: `\`❌\` | An error occurred: ${err.message}`, ephemeral: true });
    }
}

async function handleMove(interaction, client) {
    try {
        const fromIndex = interaction.options.getInteger("from") - 1;
        const toIndex = interaction.options.getInteger("to") - 1;
        const player = client.riffy.players.get(interaction.guildId);

        if (!player || !player.queue || player.queue.length === 0) {
            return interaction.reply({ content: "`❌` | The queue is empty.", ephemeral: true });
        }

        if (fromIndex < 0 || fromIndex >= player.queue.length || toIndex < 0 || toIndex >= player.queue.length) {
            return interaction.reply({ content: "`❌` | Invalid positions.", ephemeral: true });
        }

        const [movedSong] = player.queue.splice(fromIndex, 1);
        player.queue.splice(toIndex, 0, movedSong);

        return interaction.reply({
            content: `✅ | Moved **${movedSong.info.title}** from position \`${fromIndex + 1}\` to \`${toIndex + 1}\`.`,
            ephemeral: true
        });

    } catch (err) {
        logger(err, "error");
        return interaction.reply({ content: `\`❌\` | An error occurred: ${err.message}`, ephemeral: true });
    }
}
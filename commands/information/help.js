const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const ITEMS_PER_PAGE = 5;
const CATEGORY_DATA = {
    music: { emoji: '🎵', color: '#1DB954' },       // Spotify green
    filter: { emoji: '🎛️', color: '#5865F2' },     // Discord blurple
    playlist: { emoji: '📋', color: '#EB459E' },    // Pink
    misc: { emoji: '✨', color: '#FEE75C' },        // Yellow
    admin: { emoji: '🛡️', color: '#ED4245' },      // Red
    economy: { emoji: '💰', color: '#57F287' },     // Green
    rpg: { emoji: '⚔️', color: '#F04747' },        // Dark red
    giveaway: { emoji: '🎉', color: '#FF73FA' },    // Bright pink
    birthday: { emoji: '🎂', color: '#FFAC33' },    // Orange
    fun: { emoji: '😄', color: '#FEE75C' },         // Yellow
    afk: { emoji: '💤', color: '#95A5A6' },         // Gray
    ticket: { emoji: '🎟️', color: '#3498DB' },     // Blue
    information: { emoji: 'ℹ️', color: '#3498DB' }, // Blue
    setting: { emoji: '⚙️', color: '#607D8B' },     // Dark gray
    developer: { emoji: '👨‍💻', color: '#7289DA' }  // Blurple
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Display information about all available commands")
        .setDMPermission(true)
        .addStringOption(option =>
            option.setName("category")
                .setDescription("Filter commands by category")
                .setRequired(false)
                .addChoices(...Object.entries(CATEGORY_DATA).map(([value, data]) => ({
                    name: `${data.emoji} ${capitalize(value)}`,
                    value
                })))
        ),

    run: async ({ interaction, client }) => {
        await interaction.deferReply({ ephemeral: true });

        const categories = fs.readdirSync(path.join(__dirname, "../"))
            .filter(dir => !dir.includes(".") && CATEGORY_DATA[dir]);

        const state = {
            mode: interaction.options.getString("category") ? 'commands' : 'home',
            category: interaction.options.getString("category") || null,
            page: 1,
            totalPages: 1
        };

        const { embed, components } = await buildResponse(client, categories, state);
        const message = await interaction.editReply({ embeds: [embed], components });
        createCollector(message, interaction, categories, state);
    }
};

async function buildResponse(client, categories, state) {
    state.totalPages = await countPages(categories, state);
    return state.mode === 'home'
        ? buildHomeEmbed(client, categories, state)
        : buildCommandsEmbed(client, categories, state);
}

async function countPages(categories, state) {
    if (state.mode === 'home') return 1;
    const files = fs.readdirSync(path.join(__dirname, "../", state.category))
        .filter(f => f.endsWith('.js'));
    return Math.ceil(files.length / ITEMS_PER_PAGE);
}

function buildHomeEmbed(client, categories, state) {
    const categoryColor = state.category ? CATEGORY_DATA[state.category].color : '#5865F2';
    
    const embed = new EmbedBuilder()
        .setTitle(`❓ ${client.user.username} Help Center`)
        .setDescription('```diff\n+ Select a category below to view commands\n```')
        .setColor(categoryColor)
        .setFooter({ 
            text: `${client.user.username} • Page ${state.page}/${state.totalPages}`,
            iconURL: client.user.displayAvatarURL() 
        })
        .setTimestamp();

    // Group categories into rows of 3 for better organization
    const categoryGroups = [];
    for (let i = 0; i < categories.length; i += 3) {
        categoryGroups.push(categories.slice(i, i + 3));
    }

    categoryGroups.forEach(group => {
        const fieldValue = group.map(cat => {
            const count = fs.readdirSync(path.join(__dirname, '../', cat))
                .filter(f => f.endsWith('.js')).length;
            return `> ${CATEGORY_DATA[cat].emoji} **${capitalize(cat)}** \`${count} commands\``;
        }).join('\n');

        embed.addFields({ 
            name: '\u200b', 
            value: fieldValue,
            inline: false
        });
    });

    const components = buildActionRows(categories, state);
    return { embed, components };
}

function buildCommandsEmbed(client, categories, state) {
    const categoryData = CATEGORY_DATA[state.category];
    const allFiles = fs.readdirSync(path.join(__dirname, '../', state.category))
        .filter(f => f.endsWith('.js'));
    const start = (state.page - 1) * ITEMS_PER_PAGE;
    const pageItems = allFiles.slice(start, start + ITEMS_PER_PAGE)
        .map(f => require(`../${state.category}/${f}`));

    const embed = new EmbedBuilder()
        .setTitle(`${categoryData.emoji} ${capitalize(state.category)} Commands`)
        .setColor(categoryData.color)
        .setDescription(`Here are the available commands in this category:\n\u200b`)
        .setFooter({ 
            text: `${client.user.username} • Page ${state.page}/${state.totalPages}`,
            iconURL: client.user.displayAvatarURL() 
        })
        .setTimestamp();

    pageItems.forEach(cmd => {
        embed.addFields({ 
            name: `🔹 **/${cmd.data.name}**`, 
            value: `\`\`\`${cmd.data.description}\`\`\``, 
            inline: false 
        });
    });

    const components = buildActionRows(categories, state);
    return { embed, components };
}

function buildActionRows(categories, state) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('help_select')
        .setPlaceholder('🚀 Navigate to category...')
        .addOptions([
            { 
                label: 'Return to Home', 
                value: 'home',
                emoji: '🏠',
                description: 'Go back to main help menu'
            },
            ...categories.map(cat => ({
                label: capitalize(cat),
                value: cat,
                emoji: CATEGORY_DATA[cat].emoji,
                description: `View ${cat} commands`
            }))
        ]);

    const rows = [ new ActionRowBuilder().addComponents(menu) ];

    if (state.mode === 'commands') {
        const btns = [
            { id: 'first', emoji: '⏮️', label: 'First', style: ButtonStyle.Secondary },
            { id: 'prev', emoji: '◀️', label: 'Prev', style: ButtonStyle.Primary },
            { id: 'next', emoji: '▶️', label: 'Next', style: ButtonStyle.Primary },
            { id: 'last', emoji: '⏭️', label: 'Last', style: ButtonStyle.Secondary },
            { id: 'home', emoji: '🏠', label: 'Home', style: ButtonStyle.Success }
        ].map(btn => new ButtonBuilder()
            .setCustomId(`help_${btn.id}`)
            .setLabel(btn.label)
            .setEmoji(btn.emoji)
            .setStyle(btn.style)
            .setDisabled(isDisabled(btn.id, state)));

        rows.push(new ActionRowBuilder().addComponents(btns));
    }

    return rows;
}

function isDisabled(action, state) {
    if (action === 'first' || action === 'prev') return state.page === 1;
    if (action === 'next' || action === 'last') return state.page === state.totalPages;
    return false;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function createCollector(message, interaction, categories, state) {
    const collector = message.createMessageComponentCollector({ time: 3 * 60_000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '❌ This interaction is not for you!', ephemeral: true });
        }
        await i.deferUpdate();

        if (i.customId === 'help_select') {
            const sel = i.values[0];
            state.mode = sel === 'home' ? 'home' : 'commands';
            state.category = sel === 'home' ? null : sel;
            state.page = 1;
        } else {
            const act = i.customId.split('_')[1];
            switch (act) {
                case 'first': state.page = 1; break;
                case 'prev': state.page = Math.max(1, state.page - 1); break;
                case 'next': state.page = Math.min(state.totalPages, state.page + 1); break;
                case 'last': state.page = state.totalPages; break;
                case 'home': 
                    state.mode = 'home';
                    state.category = null;
                    state.page = 1;
                    break;
            }
        }

        const { embed, components } = await buildResponse(interaction.client, categories, state);
        await i.editReply({ embeds: [embed], components });
    });

    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { guild } = require('../../schemas/guild');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkwelcome')
        .setDescription('Check current welcome & leave settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    run: async ({ interaction }) => {
        try {
            const guildData = await guild.findOne({ guildId: interaction.guild.id });
            if (!guildData) {
                return await interaction.reply('ℹ️ No welcome/leave settings configured yet.');
            }

            // 📌 Welcome Settings
            const welcomeFields = [
                {
                    name: 'Welcome Channel',
                    value: guildData.welcome.channel
                        ? `<#${guildData.welcome.channel}>`
                        : 'Not set',
                    inline: true,
                },
                {
                    name: 'Welcome Role',
                    value: guildData.welcome.role
                        ? `<@&${guildData.welcome.role}>`
                        : 'Not set',
                    inline: true,
                },
                {
                    name: 'Welcome Message',
                    value: guildData.welcome.message || 'Not set',
                },
                {
                    name: 'Banner',
                    value: guildData.welcome.bannerOptions ? '✅ Enabled' : '❌ Disabled',
                    inline: true,
                },
                {
                    name: 'Direct Message',
                    value: guildData.welcome.directMessage ? '✅ Enabled' : '❌ Disabled',
                    inline: true,
                },
            ];

            // 📌 Leave Settings
            const leaveFields = [
                {
                    name: 'Leave Channel',
                    value: guildData.leave.channel
                        ? `<#${guildData.leave.channel}>`
                        : 'Not set',
                    inline: true,
                },
                {
                    name: 'Leave Message',
                    value: guildData.leave.message || 'Not set',
                },
                {
                    name: 'Leave Banner',
                    value: guildData.leave.bannerOptions ? '✅ Enabled' : '❌ Disabled',
                    inline: true,
                },
            ];

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Welcome & Leave Settings')
                .setColor('#0099ff')
                .addFields(
                    { name: '📥 Welcome Settings', value: '\u200B' },
                    ...welcomeFields,
                    { name: '\u200B', value: '\u200B' }, // pemisah
                    { name: '📤 Leave Settings', value: '\u200B' },
                    ...leaveFields
                );

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply(`❌ Failed to check settings: ${error.message}`);
        }
    },
    options: {
        group: true,
    },
};

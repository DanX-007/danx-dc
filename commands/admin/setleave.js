const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { guild } = require('../../schemas/guild');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setleave')
        .setDescription('Configure leave settings')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for leave messages')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Leave message (use {user} and {server})')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('banner')
                .setDescription('Enable leave banner (Canvafy)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    run: async ({ interaction, client }) => {
        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');
        const banner = interaction.options.getBoolean('banner');

        try {
            const updateData = {};
            if (channel) updateData["leave.channel"] = channel.id;
            if (message) updateData["leave.message"] = message;
            if (banner !== null) updateData["leave.bannerOptions"] = banner;

            await guild.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $set: updateData },
                { upsert: true }
            );

            let response = "✅ Leave settings updated:\n";
            if (channel) response += `- Channel: ${channel}\n`;
            if (message) response += `- Message: "${message}"\n`;
            if (banner !== null) response += `- Banner: ${banner ? "Enabled" : "Disabled"}\n`;

            await interaction.reply(response);
        } catch (error) {
            await interaction.reply(`❌ Failed to update leave settings: ${error.message}`);
        }
    },
    options: { admin: true, group: true, blacklist: true },
};

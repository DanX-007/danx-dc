const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { guild } = require('../../schemas/guild');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setwelcome')
        .setDescription('Configure welcome settings')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for welcome messages')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Welcome message (use {user}, {server}, {count})')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to give new members')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('banner')
                .setDescription('Enable welcome banner (Canvafy)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('directmessage')
                .setDescription('Enable direct message for welcome')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    run: async ({ interaction }) => {
        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');
        const role = interaction.options.getRole('role');
        const banner = interaction.options.getBoolean('banner');
        const directMessage = interaction.options.getBoolean('directmessage');

        try {
            const updateData = {};

            if (channel) updateData['welcome.channel'] = channel.id;
            if (message) updateData['welcome.message'] = message;
            if (role) updateData['welcome.role'] = role.id;
            if (banner !== null) updateData['welcome.bannerOptions'] = banner;
            if (directMessage !== null) updateData['welcome.directMessage.enabled'] = directMessage;

            await guild.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $set: updateData },
                { upsert: true, new: true }
            );

            let response = "✅ **Welcome settings updated:**\n";
            if (channel) response += `- Channel: ${channel}\n`;
            if (message) response += `- Message: "${message}"\n`;
            if (role) response += `- Role: ${role}\n`;
            if (banner !== null) response += `- Banner: ${banner ? "Enabled" : "Disabled"}\n`;
            if (directMessage !== null) response += `- Direct Message: ${directMessage ? "Enabled" : "Disabled"}\n`;

            await interaction.reply(response);
        } catch (error) {
            await interaction.reply(`❌ Failed to update welcome settings: ${error.message}`);
        }
    },
    options: { admin: true, group: true, blacklist: true },
};

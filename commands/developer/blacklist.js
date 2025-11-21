const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { economy } = require('../../schemas/economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Manage user blacklist status')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to blacklist/unblacklist')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for blacklist')
        )
        .addBooleanOption(option =>
            option.setName('remove')
                .setDescription('Set to true to remove blacklist')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    run: async ({ interaction }) => {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const remove = interaction.options.getBoolean('remove') || false;

        try {
            if (remove) {
                // Remove blacklist
                const result = await economy.findOneAndUpdate(
                    { userId: target.id },
                    { 
                        blacklisted: false,
                        blacklistReason: null,
                        blacklistedAt: null,
                        blacklistedBy: null
                    },
                    { new: true }
                );

                if (!result) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#FFA500')
                                .setDescription(`ℹ️ ${target.tag} wasn't blacklisted`)
                        ],
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Blacklist Removed')
                            .setDescription(`**${target.tag}** can now use bot commands again`)
                    ]
                });
            }

            // Add blacklist
            const result = await economy.findOneAndUpdate(
                { userId: target.id },
                { 
                    blacklisted: true,
                    blacklistReason: reason,
                    blacklistedAt: new Date(),
                    blacklistedBy: interaction.user.id
                },
                { upsert: true, new: true }
            );

            interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('⛔ User Blacklisted')
                        .setDescription(`**${target.tag}** can no longer use bot commands`)
                        .addFields(
                            { name: 'Reason', value: reason, inline: false },
                            { name: 'Moderator', value: interaction.user.toString(), inline: true },
                            { name: 'Date', value: `<t:${Math.floor(result.blacklistedAt.getTime()/1000)}:f>`, inline: true }
                        )
                ]
            });
        } catch (error) {
            console.error('Blacklist error:', error);
            interaction.reply({
                content: '❌ Failed to update blacklist status',
                ephemeral: true
            });
        }
    },
    options: { devOnly: true },
};
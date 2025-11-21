const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { logger } = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for the bot on top.gg to support us!'),

    run: async ({ interaction }) => {
        try {
            const voteEmbed = new EmbedBuilder()
                .setColor(0xf1c40f) // Yellow color
                .setTitle('🗳️ Vote for Me on top.gg!')
                .setDescription(`Your votes help the bot grow and get more visibility!`)
                .addFields(
                    {
                        name: 'Vote Link',
                        value: `[Click Here to Vote](https://top.gg/bot/1393135995494596618/vote)`,
                        inline: true
                    },
                    {
                        name: 'Voting Rewards',
                        value: 'Some servers give rewards for voting! Ask your server admins!',
                        inline: true
                    }
                )
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ 
                    text: `Requested by ${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL() 
                });

            await interaction.reply({ 
                embeds: [voteEmbed],
                ephemeral: true 
            });

        } catch (error) {
            logger(`Vote Command Error: ${error.message}`, 'error');
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ Vote Command Failed')
                .setDescription('An error occurred while generating the vote link');
                
            await interaction.reply({ 
                embeds: [errorEmbed],
                ephemeral: true 
            });
        }
    },
    options: { blacklist: true }
};
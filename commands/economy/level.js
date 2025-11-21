// commands/utility/level.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { economy } = require("../../schemas/economy");
const { logger } = require("../../utils/logger");
const levelUtils = require("../../utils/levelUtils");
const config = require("../../config");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("level")
        .setDescription("Check your level or level up")
        .addSubcommand(sub =>
            sub.setName("check")
                .setDescription("Check your or another user's level")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("User to check")
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName("up")
                .setDescription("Level up if you have enough XP")
        ),

    run: async ({ interaction }) => {
        const subcommand = interaction.options.getSubcommand();
        const embed = new EmbedBuilder().setColor(config.clientOptions.embedColor);

        if (subcommand === "check") {
            const targetUser = interaction.options.getUser("user") || interaction.user;

            try {
                let userEconomy = await economy.findOne({ userId: targetUser.id });
                if (!userEconomy) {
                    userEconomy = new economy({
                        userId: targetUser.id,
                        username: targetUser.username
                    });
                    await userEconomy.save();
                }

                const { currentLevelXP, nextLevelXP, progress, xpNeeded } = levelUtils.calculateLevelProgress(
                    userEconomy.xp,
                    userEconomy.level
                );

                const progressBar = levelUtils.createProgressBar(progress);
                const rank = await levelUtils.calculateUserRank(targetUser.id, userEconomy.level);

                embed
                    .setAuthor({
                        name: `${targetUser.username}'s Level Profile`,
                        iconURL: targetUser.displayAvatarURL()
                    })
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setDescription(
                        `**Level ${userEconomy.level}** ${levelUtils.getLevelBadge(userEconomy.level)}\n` +
                        `XP: ${userEconomy.xp.toLocaleString()}/${currentLevelXP.toLocaleString()}\n` +
                        `${progressBar} ${progress.toFixed(1)}%\n\n` +
                        `Next level: **${userEconomy.level + 1}** (${xpNeeded.toLocaleString()} XP needed)\n` +
                        `Server Rank: **#${rank.position}** (Top ${rank.percentile}%)`
                    )
                    .setFooter({ text: "Keep chatting to earn more XP!" });

                if (progress > 80) {
                    embed.addFields({
                        name: "Level Up Soon!",
                        value: `Only ${xpNeeded.toLocaleString()} XP left to reach level ${userEconomy.level + 1}!`,
                        inline: false
                    });
                }

                return interaction.reply({ embeds: [embed] });

            } catch (err) {
                logger(err, "error");
                return interaction.reply({
                    embeds: [embed.setDescription("❌ An error occurred while checking level.")],
                    ephemeral: true
                });
            }
        }

        if (subcommand === "up") {
            try {
                const result = await levelUtils.handleLevelUp(interaction.user.id);
                
                if (!result.success) {
                    return interaction.reply({
                        embeds: [embed.setDescription(
                            `\`❌\` | You need **${result.xpNeeded.toLocaleString()} more XP** to level up!`
                        )],
                        ephemeral: true
                    });
                }

                let levelUpMessage = `**${interaction.user.username}** has leveled up `;
                if (result.levelsGained > 1) {
                    levelUpMessage += `**${result.levelsGained} times** to **level ${result.newLevel}**!`;
                } else {
                    levelUpMessage += `to **level ${result.newLevel}**!`;
                }

                const replyEmbed = embed
                    .setAuthor({
                        name: `Level Up! 🎉`,
                        iconURL: interaction.user.displayAvatarURL()
                    })
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setDescription(
                        `${levelUpMessage}\n\n` +
                        `You received a total reward of **${result.reward.toLocaleString()} coins**!\n` +
                        `Remaining XP: **${result.remainingXP.toLocaleString()}**`
                    );

                if (result.bankCapacityIncreased) {
                    replyEmbed.addFields({
                        name: "Bank Capacity Increased",
                        value: `Your new bank capacity is **${result.newBankCapacity.toLocaleString()} coins**!`,
                        inline: false
                    });
                }

                return interaction.reply({ embeds: [replyEmbed] });

            } catch (err) {
                logger(err, "error");
                return interaction.reply({
                    embeds: [embed.setDescription(`❌ An error occurred: ${err.message}`)],
                    ephemeral: true
                });
            }
        }
    },
    options: {
        verify: true,
        blacklist: true
    }
};
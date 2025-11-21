const { EmbedBuilder } = require("discord.js");
const levelUtils = require("../../utils/levelUtils");  // Perbaikan import
const { economy } = require("../../schemas/economy");

module.exports = async (message) => {
    if (message.author.bot) return;
    
    try {
        // Gunakan findOneAndUpdate untuk atomic update
        let user = await economy.findOneAndUpdate(
            { userId: message.author.id },
            {
                $setOnInsert: {
                    userId: message.author.id,
                    username: message.author.username,
                    balance: 0,
                    xp: 0,
                    level: 1,
                    bankCapacity: levelUtils.calculateBankCapacity(1),
                    lastMessage: null
                }
            },
            { 
                upsert: true,
                new: true 
            }
        );

        // Cooldown check (60 detik)
        const now = new Date();
        if (user.lastMessage && (now - user.lastMessage) < 60000) return;

        // Add XP (5-15 XP random)
        const xpGain = Math.floor(Math.random() * 11) + 5;
        
        // Update sekaligus cek cooldown secara atomic
        user = await economy.findOneAndUpdate(
            { 
                userId: message.author.id,
                $or: [
                    { lastMessage: { $exists: false } },
                    { lastMessage: { $lt: new Date(now - 60000) } }
                ]
            },
            {
                $inc: { xp: xpGain },
                $set: { lastMessage: now }
            },
            { new: true }
        );

        if (!user) return; // Masih dalam cooldown

        // Check for level up
        const result = await levelUtils.handleLevelUp(message.author.id);
        
        if (result.success) {
            let levelUpMessage = `${message.author} has leveled up `;
            levelUpMessage += result.levelsGained > 1 
                ? `**${result.levelsGained} times** to level ${result.newLevel}!` 
                : `to level ${result.newLevel}!`;

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription(
                    `${levelUpMessage}\n` +
                    `Reward: ${result.reward.toLocaleString()} coins\n` +
                    `Remaining XP: ${result.remainingXP.toLocaleString()}`
                );

            if (result.bankCapacityIncreased) {
                embed.addFields({
                    name: "Bank Upgrade",
                    value: `Bank capacity increased to ${result.newBankCapacity.toLocaleString()} coins!`,
                    inline: false
                });
            }

            await message.channel.send({ embeds: [embed] });
        }

    } catch (err) {
        console.error("Level handler error:", err);
    }
};
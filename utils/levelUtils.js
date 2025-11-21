// utils/levelUtils.js
module.exports = {
    // XP calculation
    xpForLevel: (level) => 100 * Math.pow(level, 2),

    // Level progress calculation
    calculateLevelProgress: (xp, level) => {
        const currentLevelXP = 100 * Math.pow(level, 2);
        const nextLevelXP = 100 * Math.pow(level + 1, 2);
        const progress = Math.min((xp / currentLevelXP) * 100, 100);
        const xpNeeded = nextLevelXP - xp;
        
        return {
            currentLevelXP,
            nextLevelXP,
            progress,
            xpNeeded
        };
    },

    // Bank capacity calculation
    calculateBankCapacity: (level) => {
        const baseCapacity = 10000;
        const multiplier = Math.pow(1.3, level - 1);
        return Math.floor(baseCapacity * multiplier);
    },

    // Handle level up with all related updates
    handleLevelUp: async (userId) => {
        const { economy } = require("../schemas/economy");
        const user = await economy.findOne({ userId });
        
        if (!user) return { success: false, message: "User not found" };

        let levelsGained = 0;
        let remainingXP = user.xp;
        let currentLevel = user.level;

        // Calculate how many levels can be gained
        while (remainingXP >= module.exports.xpForLevel(currentLevel + levelsGained)) {
            remainingXP -= module.exports.xpForLevel(currentLevel + levelsGained);
            levelsGained++;
        }

        if (levelsGained === 0) {
            return { 
                success: false, 
                message: "Not enough XP to level up",
                xpNeeded: module.exports.xpForLevel(currentLevel + 1) - user.xp
            };
        }

        // Update user data
        user.level += levelsGained;
        user.xp = remainingXP;

        // Calculate reward (500 coins per new level)
        let totalReward = 0;
        for (let i = 0; i < levelsGained; i++) {
            totalReward += 500 * (currentLevel + i + 1);
        }
        user.balance += totalReward;

        // Update bank capacity
        const newBankCapacity = module.exports.calculateBankCapacity(user.level);
        const bankCapacityIncreased = newBankCapacity > user.bankCapacity;
        if (bankCapacityIncreased) {
            user.bankCapacity = newBankCapacity;
        }

        await user.save();

        return {
            success: true,
            levelsGained,
            newLevel: user.level,
            reward: totalReward,
            remainingXP,
            bankCapacityIncreased,
            newBankCapacity: bankCapacityIncreased ? newBankCapacity : user.bankCapacity
        };
    },

    // Visual progress bar
    createProgressBar: (percentage) => {
        const progressBarLength = 15;
        const filled = Math.round(progressBarLength * (percentage / 100));
        return '🟩'.repeat(filled) + '⬜'.repeat(progressBarLength - filled);
    },

    // Level badge
    getLevelBadge: (level) => {
        if (level >= 100) return '🏆';
        if (level >= 50) return '🎖️';
        if (level >= 25) return '⭐';
        if (level >= 10) return '🔹';
        return '';
    },

    // Calculate user rank
    calculateUserRank: async (userId, userLevel) => {
        try {
            const { economy } = require("../schemas/economy");
            const allUsers = await economy.find({}).sort({ level: -1, xp: -1 });
            const userIndex = allUsers.findIndex(u => u.userId === userId);
            const totalUsers = allUsers.length;

            return {
                position: userIndex + 1,
                percentile: Math.round(((totalUsers - userIndex) / totalUsers) * 100)
            };
        } catch (err) {
            return { position: '?', percentile: '?' };
        }
    }
};
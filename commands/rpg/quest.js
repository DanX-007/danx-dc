const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { economy } = require('../../schemas/economy');
const { Quest } = require('../../schemas/quest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Manage your quests')
        .addSubcommand(subcommand =>
            subcommand.setName('list').setDescription('List all available quests'))
        .addSubcommand(subcommand =>
            subcommand.setName('view').setDescription('View a quest details')
                .addStringOption(option => option.setName('id').setDescription('Quest ID').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('titles').setDescription('Manage your unlocked titles')),

    run: async ({ interaction }) => {
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case 'list': return handleQuestList(interaction);
            case 'view': return handleQuestView(interaction);
            case 'titles': return handleTitles(interaction);
        }
    },
    options: {
    verify: true,
    blacklist:true,
    level: 5
    }
};

const handleQuestList = async (interaction) => {
    const userId = interaction.user.id;
    try {
        const userData = await economy.findOne({ userId });
        if (!userData) return interaction.reply({ content: '❌ Your economy profile has not been created yet!', ephemeral: true });

        const availableQuests = await Quest.find({
            $or: [
                { requiredLevel: { $lte: userData.level } },
                { requiredLevel: { $lte: userData.level + 10 } }
            ]
        }).sort({ requiredLevel: 1 });

        if (availableQuests.length === 0) return interaction.reply({ content: '❌ No quests available for your level!', ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('📜 Quest List')
            .setDescription(`Your Level: ${userData.level}\nAvailable Points: ${userData.points.current}`);

        const currentQuests = [];
        const upcomingQuests = [];

        availableQuests.forEach(quest => {
            const progress = userData.questProgress?.get(quest.id) || { completions: 0 };
            const questInfo = {
                name: `${quest.name} (Lvl. ${quest.requiredLevel})`,
                value: `Progress: ${progress.completions}/${quest.maxCompletions}\nCategory: ${formatCategory(quest.category)}\nUse \`/quest view id:${quest.id}\` for details`,
                inline: true
            };

            if (quest.requiredLevel <= userData.level) {
                currentQuests.push(questInfo);
            } else {
                upcomingQuests.push({ ...questInfo, name: `${questInfo.name} 🔒` });
            }
        });

        if (currentQuests.length > 0) embed.addFields({ name: '✅ Available Quests', value: 'Quests you can complete now:' }, ...currentQuests);
        if (upcomingQuests.length > 0) embed.addFields({ name: '🔜 Upcoming Quests', value: 'Quests that will unlock at higher levels:' }, ...upcomingQuests);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error listing quests:', error);
        await interaction.reply({ content: '❌ An error occurred while listing quests!', ephemeral: true });
    }
};

const handleQuestView = async (interaction) => {
    const questId = interaction.options.getString('id');
    const userId = interaction.user.id;
    try {
        const [quest, userData] = await Promise.all([
            Quest.findOne({ id: questId }),
            economy.findOne({ userId })
        ]);

        if (!quest) return interaction.reply({ content: '❌ Quest not found!', ephemeral: true });

        const progress = userData.questProgress?.get(quest.id) || { completions: 0 };
        const successChance = Math.min(95, quest.baseSuccessChance + (userData.dexterity * 0.5));
        const isAvailable = quest.requiredLevel <= userData.level;
        const isComplete = progress.completions >= quest.maxCompletions;

        // Format rewards properly
        const formattedRewards = [];
        if (quest.rewards.xp > 0) formattedRewards.push(`✨ ${quest.rewards.xp} XP`);
        if (quest.rewards.balance > 0) formattedRewards.push(`💰 ${quest.rewards.balance} Coins`);
        if (quest.rewards.items && quest.rewards.items.size > 0) {
            const itemsList = [];
            quest.rewards.items.forEach((value, key) => {
                itemsList.push(`${value}x ${key}`);
            });
            formattedRewards.push(`📦 Items: ${itemsList.join(', ')}`);
        }

        let titleRewardInfo = 'None';
        if (quest.titleReward) {
            titleRewardInfo = `**${quest.titleReward.name}**\n${formatStats(quest.titleReward.stats)}`;
        }

        const embed = new EmbedBuilder()
            .setColor(isAvailable ? (isComplete ? '#00FF00' : '#FFA500') : '#FF0000')
            .setTitle(`${quest.name} ${isComplete ? '✅' : ''}`)
            .setDescription(quest.description)
            .addFields(
                { name: '📊 Progress', value: `${createProgressBar(progress.completions, quest.maxCompletions)}\n${progress.completions}/${quest.maxCompletions} completions` },
                { name: '⚔️ Level Requirement', value: `${quest.requiredLevel}`, inline: true },
                { name: '🎯 Your Level', value: `${userData.level}`, inline: true },
                { name: '📌 Status', value: isComplete ? '✅ Completed' : isAvailable ? '🟢 Available' : '🔴 Requires higher level', inline: true },
                { name: '🎲 Success Chance', value: `${successChance}%`, inline: true },
                { name: '🔄 Category', value: `${formatCategory(quest.category)}`, inline: true },
                { name: '🏆 Rewards', value: formattedRewards.join('\n') || 'None' },
                { name: '👑 Title Reward', value: titleRewardInfo }
            );

        const buttons = [
            new ButtonBuilder().setCustomId('close_quest').setLabel('Close').setStyle(ButtonStyle.Secondary)
        ];

        if (isAvailable && !isComplete) {
            buttons.unshift(
                new ButtonBuilder()
                    .setCustomId(`complete_${quest.id}`)
                    .setLabel('Attempt Quest')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎯')
                    .setDisabled(userData.points.current <= 0)
            );
        }

        const row = new ActionRowBuilder().addComponents(buttons);
        const response = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        // Create collector for buttons
        const filter = i => i.user.id === userId && (
            i.customId === `complete_${quest.id}` || 
            i.customId === 'close_quest'
        );
        
        const collector = response.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === `complete_${quest.id}`) {
                await handleQuestComplete(i, questId, userId);
            } else if (i.customId === 'close_quest') {
                await i.update({ components: [] });
            }
        });

        collector.on('end', () => {
            // Cleanup if needed
        });

    } catch (error) {
        console.error('Error viewing quest:', error);
        await interaction.reply({ content: '❌ An error occurred while viewing the quest!', ephemeral: true });
    }
};

const handleQuestComplete = async (interaction, questId, userId) => {
    try {
        await interaction.deferUpdate();
        const [quest, userData] = await Promise.all([
            Quest.findOne({ id: questId }),
            economy.findOne({ userId })
        ]);

        if (!quest || !userData) {
            return interaction.editReply({ 
                content: '❌ Quest or user data not found!', 
                components: [] 
            });
        }

        // Get current progress
        const currentProgress = userData.questProgress?.get(questId) || { completions: 0 };
        const isComplete = currentProgress.completions >= quest.maxCompletions;

        if (isComplete) {
            return interaction.editReply({ 
                content: '✅ You already completed this quest!', 
                components: [] 
            });
        }

        // Check available points
        if (userData.points.current <= 0) {
            return interaction.editReply({ 
                content: '❌ You have no quest points left!', 
                components: [] 
            });
        }

        // Calculate success
        const successChance = Math.min(95, quest.baseSuccessChance + (userData.dexterity * 0.5));
        const isSuccess = Math.random() * 100 <= successChance;
        const newCompletions = currentProgress.completions + (isSuccess ? 1 : 0);

        // Prepare update
        const updateOps = {
            $inc: { 'points.current': -1 },
            $set: {
                [`questProgress.${questId}`]: {
                    completions: newCompletions,
                    lastAttempt: new Date()
                }
            }
        };

        // Add rewards if successful
        if (isSuccess) {
            updateOps.$inc.balance = quest.rewards.balance || 0;
            updateOps.$inc.xp = quest.rewards.xp || 0;
            
            if (quest.rewards.items && quest.rewards.items.size > 0) {
                quest.rewards.items.forEach((quantity, itemId) => {
                    updateOps.$inc[`inventory.${itemId}`] = quantity;
                });
            }

            // Check if quest completed
            if (newCompletions >= quest.maxCompletions && quest.titleReward) {
                updateOps.$addToSet = { 
                    completedQuests: questId,
                    unlockedTitles: quest.titleReward 
                };
            }
        }

        // Execute update
        await economy.updateOne({ userId }, updateOps);

        // Get updated user data
        const updatedUser = await economy.findOne({ userId });

        // Create updated embed
        const updatedEmbed = new EmbedBuilder()
            .setColor(newCompletions >= quest.maxCompletions ? '#00FF00' : isSuccess ? '#FFA500' : '#FF0000')
            .setTitle(`${quest.name} ${newCompletions >= quest.maxCompletions ? '✅' : ''}`)
            .setDescription(quest.description)
            .addFields(
                { name: '📊 Progress', value: `${createProgressBar(newCompletions, quest.maxCompletions)}\n${newCompletions}/${quest.maxCompletions} completions` },
                { name: '⚔️ Level Requirement', value: `${quest.requiredLevel}`, inline: true },
                { name: '🎯 Your Level', value: `${updatedUser.level}`, inline: true },
                { name: '📌 Status', value: newCompletions >= quest.maxCompletions ? '✅ Completed' : '🟢 In Progress', inline: true },
                { name: '🎲 Success Chance', value: `${successChance}%`, inline: true },
                { name: '🔄 Category', value: `${formatCategory(quest.category)}`, inline: true },
                { name: '🏆 Rewards', value: formatRewards(quest.rewards) },
                { name: '👑 Title Reward', value: quest.titleReward ? `**${quest.titleReward.name}**\n${formatStats(quest.titleReward.stats)}` : 'None' }
            );

        // Create buttons (remove if quest completed)
        const buttons = [];
        if (newCompletions < quest.maxCompletions) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`complete_${quest.id}`)
                    .setLabel('Attempt Quest')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎯')
                    .setDisabled(updatedUser.points.current <= 0)
            );
        }
        
        buttons.push(
            new ButtonBuilder()
                .setCustomId('close_quest')
                .setLabel('Close')
                .setStyle(ButtonStyle.Secondary)
        );

        const row = new ActionRowBuilder().addComponents(buttons);

        // Update the message
        await interaction.editReply({ 
            embeds: [updatedEmbed], 
            components: [row] 
        });

    } catch (error) {
        console.error('Error completing quest:', error);
        await interaction.editReply({ 
            content: '❌ An error occurred while completing the quest!', 
            components: [] 
        });
    }
};

const handleTitles = async (interaction) => {
    const userId = interaction.user.id;
    try {
        const userData = await economy.findOne({ userId });
        if (!userData.unlockedTitles || userData.unlockedTitles.length === 0) {
            return interaction.reply({ content: '❌ You have no titles unlocked yet!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏆 Your Titles')
            .setDescription('Titles you have unlocked:');

        userData.unlockedTitles.forEach(title => {
            embed.addFields({ 
                name: `${title.name} ${userData.currentTitle === title.name ? '⭐' : ''}`, 
                value: `Stats: ${formatStats(title.stats)}`, 
                inline: true 
            });
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('equip_title')
                .setLabel('Equip Title')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('close_title')
                .setLabel('Close')
                .setStyle(ButtonStyle.Secondary)
        );

        const response = await interaction.reply({ 
            embeds: [embed], 
            components: [row], 
            ephemeral: true 
        });

        // Create collector for title buttons
        const filter = i => i.user.id === userId && (
            i.customId === 'equip_title' || 
            i.customId === 'close_title'
        );
        
        const collector = response.createMessageComponentCollector({ 
            filter, 
            time: 60000 
        });

        collector.on('collect', async i => {
            if (i.customId === 'equip_title') {
                await handleTitleEquip(i, userId);
            } else if (i.customId === 'close_title') {
                await i.update({ components: [] });
            }
        });

        collector.on('end', () => {
            // Cleanup if needed
        });

    } catch (error) {
        console.error('Error handling titles:', error);
        await interaction.reply({ content: '❌ An error occurred while viewing your titles!', ephemeral: true });
    }
};

const handleTitleEquip = async (interaction, userId) => {
    try {
        const userData = await economy.findOne({ userId });
        if (!userData.unlockedTitles || userData.unlockedTitles.length === 0) {
            return interaction.update({ content: '❌ You have no titles unlocked yet!', components: [] });
        }

        // Buat pilihan title
        const options = userData.unlockedTitles.map(title => {
            const isEquipped = userData.currentTitles.some(t => t.name === title.name);
            return {
                label: title.name,
                description: `${formatStats(title.stats)} ${isEquipped ? '(Equipped)' : ''}`,
                value: title.name,
                default: isEquipped
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_title')
            .setPlaceholder('Select titles to equip (max 3)')
            .setMinValues(0)
            .setMaxValues(3)
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.update({ 
            content: '**Equip Titles**\nSelect up to 3 titles to equip:', 
            components: [row] 
        });

        const filter = i => i.customId === 'select_title' && i.user.id === userId;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
            const selectedTitles = i.values;
            
            // 1. Hitung stat yang harus dikurangi (dari title yang diunequip)
            const statsToRemove = {};
            userData.currentTitles.forEach(title => {
                if (!selectedTitles.includes(title.name)) {
                    Object.entries(title.stats).forEach(([stat, value]) => {
                        statsToRemove[stat] = (statsToRemove[stat] || 0) - value;
                    });
                }
            });
            
            // 2. Hitung stat yang harus ditambah (dari title yang diequip)
            const statsToAdd = {};
            selectedTitles.forEach(titleName => {
                const title = userData.unlockedTitles.find(t => t.name === titleName);
                if (title && !userData.currentTitles.some(t => t.name === titleName)) {
                    Object.entries(title.stats).forEach(([stat, value]) => {
                        statsToAdd[stat] = (statsToAdd[stat] || 0) + value;
                    });
                }
            });
            
            // 3. Gabungkan perubahan stat
            const statChanges = {};
            Object.entries(statsToRemove).forEach(([stat, value]) => {
                statChanges[stat] = (statChanges[stat] || 0) + value;
            });
            Object.entries(statsToAdd).forEach(([stat, value]) => {
                statChanges[stat] = (statChanges[stat] || 0) + value;
            });
            
            // 4. Update database
            const newEquippedTitles = userData.unlockedTitles
                .filter(t => selectedTitles.includes(t.name))
                .map(t => ({ name: t.name, stats: t.stats }));
            
            await economy.updateOne(
                { userId },
                { 
                    $set: { currentTitles: newEquippedTitles },
                    $inc: statChanges
                }
            );
            
            // 5. Tampilkan hasil
            const equippedList = newEquippedTitles.length > 0 
                ? newEquippedTitles.map(t => `• ${t.name} ${formatStats(t.stats)}`).join('\n')
                : 'No titles equipped';
            
            await i.update({ 
                content: `✅ Updated equipped titles:\n${equippedList}\n\n**Stat changes applied directly to your character.**`, 
                components: [] 
            });
        });
    } catch (error) {
        console.error('Error managing titles:', error);
        await interaction.editReply({ content: '❌ Failed to update titles!', components: [] });
    }
};

const createProgressBar = (current, max, length = 10) => {
    const progress = Math.min(current, max);
    const percentage = Math.round((progress / max) * 100);
    const filled = Math.round((progress / max) * length);
    const empty = length - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`;
};

const formatStats = (stats) => {
    const parts = [];
    if (stats.attack > 0) parts.push(`⚔️ +${stats.attack} Attack`);
    if (stats.defense > 0) parts.push(`🛡️ +${stats.defense} Defense`);
    if (stats.maxHp > 0) parts.push(`❤️ +${stats.maxHp} Max HP`);
    if (stats.dexterity > 0) parts.push(`🎯 +${stats.dexterity} Dexterity`);
    return parts.join('\n') || 'No stat bonuses';
};
const formatRewards = (rewards) => {
    const formatted = [];
    if (rewards.xp > 0) formatted.push(`✨ ${rewards.xp} XP`);
    if (rewards.balance > 0) formatted.push(`💰 ${rewards.balance} Coins`);
    if (rewards.items && rewards.items.size > 0) {
        const items = [];
        rewards.items.forEach((quantity, itemId) => {
            items.push(`${quantity}x ${itemId}`);
        });
        formatted.push(`📦 Items: ${items.join(', ')}`);
    }
    return formatted.join('\n') || 'No rewards';
};

const formatCategory = (category) => {
    // Format category names to be more readable
    const categoryMap = {
        'crafting': 'Crafting',
        'combat': 'Combat',
        'exploration': 'Exploration',
        'gathering': 'Gathering'
    };
    return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
};
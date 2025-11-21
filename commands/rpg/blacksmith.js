const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, EmbedBuilder } = require('discord.js');
const { economy } = require('../../schemas/economy');
const recipes = require('../../data/recipe.json');
const items = require('../../data/items.json');

// Helper function to get emoji for rarity
const getRarityEmoji = (rarity) => {
    const emojis = {
        common: '⚪',
        uncommon: '🟢',
        rare: '🔵',
        epic: '🟣',
        legendary: '🟡'
    };
    return emojis[rarity.toLowerCase()] || '';
};

// Helper function to get color for rarity
const getRarityColor = (rarity) => {
    const colors = {
        common: '#FFFFFF',
        uncommon: '#2ECC71',
        rare: '#3498DB',
        epic: '#9B59B6',
        legendary: '#F1C40F'
    };
    return colors[rarity.toLowerCase()] || '#FFFFFF';
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacksmith')
        .setDescription('Craft equipment or items using materials'),

    run: async ({ interaction }) => {
        try {
            await interaction.deferReply();
            
            const userId = interaction.user.id;
            const userData = await economy.findOne({ userId });

            if (!userData) {
                return interaction.editReply({ 
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Error')
                            .setDescription('User data not found. Please try again later.')
                    ],
                    ephemeral: true 
                });
            }

            // Create category select menu with better formatting
            const categories = Object.keys(recipes);
            const categoryMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_category')
                    .setPlaceholder('Select a category')
                    .addOptions(categories.map(cat => ({ 
                        label: cat.charAt(0).toUpperCase() + cat.slice(1), 
                        value: cat,
                        emoji: cat === 'weapons' ? '⚔️' : cat === 'armor' ? '🛡️' : '🛠️'
                    }))
            ));

            const initialEmbed = new EmbedBuilder()
                .setColor('#F5A623')
                .setTitle('🛠️ Blacksmith Workshop')
                .setDescription('Welcome to the blacksmith workshop! Here you can craft various items using materials you\'ve gathered.')
                .addFields(
                    { name: 'Your Blacksmithing Skill', value: `Level ${userData.skills.blacksmithing} (${userData.skills.blacksmithingXp}/${100 * userData.skills.blacksmithing} XP)`, inline: true }
                )
                .setFooter({ text: 'Select a category to begin crafting' });

            const reply = await interaction.editReply({ 
                embeds: [initialEmbed],
                components: [categoryMenu]
            });

            const collector = reply.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000,
            });

            collector.on('collect', async i => {
                try {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ 
                            embeds: [
                                new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setDescription('❌ This menu is not for you!')
                            ],
                            ephemeral: true 
                        });
                    }

                    if (i.customId === 'select_category') {
                        const selectedCategory = i.values[0];
                        const rarities = Object.keys(recipes[selectedCategory]);

                        const rarityMenu = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('select_rarity')
                                .setPlaceholder('Select a rarity')
                                .addOptions(rarities.map(rarity => ({ 
                                    label: rarity.charAt(0).toUpperCase() + rarity.slice(1), 
                                    value: `${selectedCategory}:${rarity}`,
                                    emoji: getRarityEmoji(rarity)
                                }))
                        ));

                        const categoryEmbed = new EmbedBuilder()
                            .setColor('#F5A623')
                            .setTitle(`🛠️ ${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Crafting`)
                            .setDescription(`Select the rarity of ${selectedCategory} you want to craft:`)
                            .setFooter({ text: `Your blacksmithing level: ${userData.skills.blacksmithing}` });

                        await i.update({ 
                            embeds: [categoryEmbed],
                            components: [rarityMenu] 
                        });
                    } 
                    else if (i.customId === 'select_rarity') {
                        const [category, rarity] = i.values[0].split(':');
                        const recipeItems = recipes[category][rarity];

                        const itemMenu = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('select_item')
                                .setPlaceholder('Select item to craft')
                                .addOptions(Object.keys(recipeItems).map(name => {
                                    const recipe = recipeItems[name];
                                    const canCraft = userData.skills.blacksmithing >= (recipe.requiredSkill || 1);
                                    const itemInfo = items.find(item => item.id === recipe.id);
                                    
                                    return {
                                        label: name,
                                        value: `${category}:${rarity}:${name}`,
                                        description: canCraft ? 
                                            `${Object.entries(recipe.materials).map(([matId, qty]) => {
                                                const mat = items.find(i => i.id === matId);
                                                return `${qty}x ${mat?.name || matId}`;
                                            }).join(', ')}` : 
                                            `Requires skill ${recipe.requiredSkill}`,
                                        emoji: itemInfo?.emoji || '❓',
                                        default: false
                                    };
                                })
                        ));

                        const rarityEmbed = new EmbedBuilder()
                            .setColor(getRarityColor(rarity))
                            .setTitle(`${getRarityEmoji(rarity)} ${rarity.charAt(0).toUpperCase() + rarity.slice(1)} ${category}`)
                            .setDescription(`Select an item to craft. Your skill: ${userData.skills.blacksmithing}`)
                            .setFooter({ text: 'Items in red require higher blacksmithing skill' });

                        await i.update({ 
                            embeds: [rarityEmbed],
                            components: [itemMenu] 
                        });
                    } 
                    else if (i.customId === 'select_item') {
                        const [category, rarity, itemName] = i.values[0].split(':');
                        const recipe = recipes[category][rarity][itemName];
                        const craftedItem = items.find(item => item.id === recipe.id);

                        // Check skill requirement
                        if (userData.skills.blacksmithing < (recipe.requiredSkill || 1)) {
                            const errorEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('❌ Skill Requirement Not Met')
                                .setDescription(`You need blacksmithing skill level **${recipe.requiredSkill}** to craft **${itemName}**`)
                                .addFields(
                                    { name: 'Your Skill Level', value: `${userData.skills.blacksmithing}`, inline: true },
                                    { name: 'Required Level', value: `${recipe.requiredSkill}`, inline: true }
                                )
                                .setFooter({ text: 'Keep practicing to increase your skill!' });

                            return i.reply({
                                embeds: [errorEmbed],
                                ephemeral: true
                            });
                        }

                        // Check materials
                        const missing = [];
                        let hasAllMaterials = true;
                        const materialFields = [];

                        for (const [materialId, amount] of Object.entries(recipe.materials)) {
                            const owned = userData.inventory.get(materialId) || 0;
                            const material = items.find(item => item.id === materialId);
                            if (owned < amount) {
                                hasAllMaterials = false;
                                missing.push(`${material?.name || materialId}: ${owned}/${amount}`);
                            }
                            materialFields.push({
                                name: `${material?.emoji || '📦'} ${material?.name || materialId}`,
                                value: `${owned}/${amount}`,
                                inline: true
                            });
                        }

                        if (!hasAllMaterials) {
                            const materialsEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('❌ Missing Materials')
                                .setDescription(`You don't have enough materials to craft **${itemName}**`)
                                .addFields(materialFields)
                                .setFooter({ text: 'Gather more materials and try again' });

                            return i.reply({
                                embeds: [materialsEmbed],
                                ephemeral: true,
                            });
                        }

                        // Deduct materials
                        for (const [materialId, amount] of Object.entries(recipe.materials)) {
                            const currentAmount = userData.inventory.get(materialId) || 0;
                            const newAmount = currentAmount - amount;
                            
                            if (newAmount <= 0) {
                                userData.inventory.delete(materialId);
                            } else {
                                userData.inventory.set(materialId, newAmount);
                            }
                        }

                        // Add crafted item
                        userData.inventory.set(
                            recipe.id,
                            (userData.inventory.get(recipe.id) || 0) + 1
                        );

                        // Update stats
                        userData.stats.craftingAttempts += 1;
                        userData.stats.craftingSuccess += 1;
                        
                        const currentCrafted = userData.stats.itemsCrafted.get(recipe.id) || 0;
                        userData.stats.itemsCrafted.set(recipe.id, currentCrafted + 1);

                        // Update blacksmithing skill
                        const xpGain = 10 * (['rare', 'epic', 'legendary'].includes(rarity) ? 2 : 1);
                        userData.skills.blacksmithingXp += xpGain;
                        
                        // Check for level up
                        const xpNeeded = 100 * userData.skills.blacksmithing;
                        let levelUpMessage = '';
                        
                        if (userData.skills.blacksmithingXp >= xpNeeded) {
                            userData.skills.blacksmithing += 1;
                            userData.skills.blacksmithingXp = 0;
                            levelUpMessage = `\n\n🎉 **LEVEL UP!** Your blacksmithing skill is now level ${userData.skills.blacksmithing}!`;
                        }

                        await userData.save();

                        // Create success embed
                        const successEmbed = new EmbedBuilder()
                            .setColor(getRarityColor(rarity))
                            .setTitle(`${craftedItem.emoji || '🛠️'} Successfully Crafted ${craftedItem.name} ${craftedItem.emoji || '🛠️'}`)
                            .setDescription(`You crafted a ${rarity} ${category}!\n${levelUpMessage}`)
                            .addFields(
                                { 
                                    name: 'Materials Used', 
                                    value: Object.entries(recipe.materials).map(([matId, qty]) => {
                                        const mat = items.find(i => i.id === matId);
                                        return `${mat?.emoji || '📦'} ${mat?.name || matId}: ${qty}`;
                                    }).join('\n'),
                                    inline: true 
                                },
                                { 
                                    name: 'Skill Progress', 
                                    value: `Blacksmithing: Level ${userData.skills.blacksmithing}\nXP: ${userData.skills.blacksmithingXp}/${xpNeeded}`,
                                    inline: true 
                                }
                            )
                            .setThumbnail(craftedItem.image || 'https://i.imgur.com/J5g8X3W.png')
                            .setFooter({ text: 'Visit the blacksmith again to craft more items' });

                        await i.update({ 
                            embeds: [successEmbed], 
                            components: [] 
                        });
                        collector.stop();
                    }
                } catch (error) {
                    console.error('Blacksmith collector error:', error);
                    await i.reply({ 
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('❌ Crafting Error')
                                .setDescription('An error occurred during crafting. Please try again.')
                        ],
                        ephemeral: true 
                    });
                }
            });

            collector.on('end', () => {
                if (!interaction.replied) {
                    const timeoutEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setDescription('⌛ Crafting menu timed out. Use `/blacksmith` again if you want to craft something.');
                    
                    interaction.editReply({ 
                        embeds: [timeoutEmbed], 
                        components: [] 
                    }).catch(() => {});
                }
            });

        } catch (error) {
            console.error('Blacksmith command error:', error);
            await interaction.editReply({ 
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Command Error')
                        .setDescription('An error occurred while processing your request.')
                ]
            });
        }
    },
    options: {
        verify: true,
        blacklist:true
    }
};
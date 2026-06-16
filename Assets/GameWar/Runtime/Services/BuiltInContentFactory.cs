using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    public static class BuiltInContentFactory
    {
        public static TankDefinition CreateDefaultTankDefinition()
        {
            TankDefinition definition = ScriptableObject.CreateInstance<TankDefinition>();
            definition.tankId = "starter_tank";
            definition.displayName = "Starter Tank";
            definition.bodyColor = new Color(0.19f, 0.62f, 0.92f, 1f);
            definition.baseStats = TankStats.CreatePlayerDefault();
            return definition;
        }

        public static List<UpgradeNode> CreateDefaultUpgrades()
        {
            List<UpgradeNode> upgrades = new List<UpgradeNode>();

            upgrades.Add(CreateUpgrade(
                "reinforced_hull",
                "Reinforced Hull",
                "Increase health and armor.",
                55,
                BuildModifier(35f, 0f, 0f, 0f, 1.5f, 0f, 0f, 0, 0f, 0f, 0f, 0f, 0f, 0f, TankFeature.None),
                null));

            upgrades.Add(CreateUpgrade(
                "turbo_drive",
                "Turbo Drive",
                "Move faster and turn quicker.",
                60,
                BuildModifier(0f, 0f, 0f, 1.5f, 0f, 0f, 0f, 0, 0f, 0f, 0f, 0f, 0f, 1.2f, TankFeature.DashModule),
                new string[] { "reinforced_hull" }));

            upgrades.Add(CreateUpgrade(
                "high_caliber",
                "High Caliber",
                "Increase damage output.",
                65,
                BuildModifier(0f, 8f, 0f, 0f, 0f, 0f, 0f, 0, 0f, 0f, 0f, 0f, 0f, 0f, TankFeature.None),
                new string[] { "reinforced_hull" }));

            upgrades.Add(CreateUpgrade(
                "quick_reload",
                "Quick Reload",
                "Fire more often.",
                70,
                BuildModifier(0f, 0f, 0.35f, 0f, 0f, 0f, 0f, 0, 0f, 0f, 0f, 0f, 0f, 0f, TankFeature.None),
                new string[] { "high_caliber" }));

            upgrades.Add(CreateUpgrade(
                "armor_piercing",
                "Armor Piercing",
                "Projectiles pierce more targets.",
                75,
                BuildModifier(0f, 0f, 0f, 0f, 0f, 0f, 0f, 1, 0f, 0f, 0f, 0f, 0f, 0f, TankFeature.PiercingShells),
                new string[] { "quick_reload" }));

            upgrades.Add(CreateUpgrade(
                "explosive_rounds",
                "Explosive Rounds",
                "Shells explode on impact.",
                80,
                BuildModifier(0f, 4f, 0f, 0f, 0f, 0f, 0f, 0, 1.8f, 0f, 0f, 0f, 0f, 0f, TankFeature.ExplosiveShells),
                new string[] { "high_caliber" }));

            upgrades.Add(CreateUpgrade(
                "frost_shells",
                "Frost Shells",
                "Hits slow enemies for a short time.",
                85,
                BuildModifier(0f, 0f, 0f, 0f, 0f, 0f, 0f, 0, 0f, -0.12f, 0.35f, 0f, 0f, 0f, TankFeature.SlowingShells),
                new string[] { "quick_reload" }));

            upgrades.Add(CreateUpgrade(
                "shield_generator",
                "Shield Generator",
                "Add a regenerating shield buffer.",
                95,
                BuildModifier(0f, 0f, 0f, 0f, 0f, 0f, 0f, 0, 0f, 0f, 0f, 25f, 4f, 0f, TankFeature.ShieldBurst),
                new string[] { "reinforced_hull" }));

            return upgrades;
        }

        public static List<StageDefinition> CreateDefaultStages()
        {
            List<StageDefinition> stages = new List<StageDefinition>();
            for (int index = 1; index <= 10; index++)
            {
                stages.Add(CreateStage(index));
            }

            return stages;
        }

        public static StageDefinition CreateStage(int stageIndex)
        {
            StageDefinition stage = ScriptableObject.CreateInstance<StageDefinition>();
            stage.stageIndex = stageIndex;
            stage.stageId = "stage_" + stageIndex.ToString("00");
            stage.displayName = "Operation " + stageIndex;
            stage.rewardCurrency = 35 + (stageIndex * 18);
            stage.bossStage = stageIndex % 5 == 0;
            stage.waves = new List<EnemyWaveDefinition>();

            int waveCount = Mathf.Clamp(2 + stageIndex / 2, 2, 5);
            for (int wave = 0; wave < waveCount; wave++)
            {
                EnemyWaveDefinition definition = new EnemyWaveDefinition();
                definition.archetype = PickArchetype(stageIndex, wave, stage.bossStage);
                definition.count = 2 + stageIndex + wave;
                definition.spawnInterval = Mathf.Max(0.35f, 0.75f - stageIndex * 0.03f);
                definition.healthMultiplier = 1f + stageIndex * 0.16f + wave * 0.08f;
                definition.damageMultiplier = 1f + stageIndex * 0.08f + wave * 0.05f;
                definition.speedMultiplier = 1f + stageIndex * 0.03f;
                definition.fireRateMultiplier = 1f + stageIndex * 0.02f;
                stage.waves.Add(definition);
            }

            if (stage.bossStage)
            {
                EnemyWaveDefinition bossWave = new EnemyWaveDefinition();
                bossWave.archetype = EnemyArchetype.Boss;
                bossWave.count = 1;
                bossWave.spawnInterval = 0.2f;
                bossWave.healthMultiplier = 3.2f + stageIndex * 0.35f;
                bossWave.damageMultiplier = 2.1f + stageIndex * 0.16f;
                bossWave.speedMultiplier = 0.9f + stageIndex * 0.01f;
                bossWave.fireRateMultiplier = 1.1f;
                stage.waves.Add(bossWave);
            }

            return stage;
        }

        public static TankStats CreateEnemyStats(EnemyArchetype archetype, int stageIndex, EnemyWaveDefinition wave)
        {
            TankStats stats = TankStats.CreateEnemyDefault();

            switch (archetype)
            {
                case EnemyArchetype.Striker:
                    stats.maxHealth += 15f;
                    stats.damage += 5f;
                    stats.moveSpeed += 1.2f;
                    stats.fireRate += 0.2f;
                    break;
                case EnemyArchetype.Sniper:
                    stats.maxHealth -= 10f;
                    stats.damage += 10f;
                    stats.fireRate += 0.45f;
                    stats.projectileRange += 8f;
                    stats.projectileSpeed += 4f;
                    break;
                case EnemyArchetype.Boss:
                    stats.maxHealth += 110f;
                    stats.damage += 12f;
                    stats.moveSpeed -= 0.8f;
                    stats.fireRate += 0.35f;
                    stats.armor += 2f;
                    stats.projectilePierce = 1;
                    break;
            }

            stats.maxHealth = Mathf.Max(20f, stats.maxHealth * wave.healthMultiplier);
            stats.damage = Mathf.Max(5f, stats.damage * wave.damageMultiplier);
            stats.moveSpeed = Mathf.Max(1.5f, stats.moveSpeed * wave.speedMultiplier);
            stats.fireRate = Mathf.Max(0.35f, stats.fireRate * wave.fireRateMultiplier);
            stats.projectileSpeed *= Mathf.Lerp(1f, 1.2f, Mathf.Clamp01(stageIndex * 0.06f));
            stats.projectileRange *= Mathf.Lerp(1f, 1.15f, Mathf.Clamp01(stageIndex * 0.05f));
            return stats;
        }

        public static List<string> BuildUpgradeChoices(List<UpgradeNode> pool, SaveProfile profile, int count)
        {
            List<string> choices = new List<string>();
            if (pool == null || pool.Count == 0)
            {
                return choices;
            }

            List<UpgradeNode> available = new List<UpgradeNode>();
            foreach (UpgradeNode node in pool)
            {
                if (node == null)
                {
                    continue;
                }

                if (profile != null && profile.unlockedUpgradeIds.Contains(node.upgradeId) && node.oneTimeOnly)
                {
                    continue;
                }

                if (!ArePrerequisitesMet(profile, node))
                {
                    continue;
                }

                available.Add(node);
            }

            while (choices.Count < count && available.Count > 0)
            {
                int index = Random.Range(0, available.Count);
                UpgradeNode choice = available[index];
                available.RemoveAt(index);
                choices.Add(choice.upgradeId);
            }

            return choices;
        }

        public static bool ArePrerequisitesMet(SaveProfile profile, UpgradeNode node)
        {
            if (node == null || node.prerequisites == null || node.prerequisites.Length == 0)
            {
                return true;
            }

            if (profile == null)
            {
                return false;
            }

            for (int i = 0; i < node.prerequisites.Length; i++)
            {
                string prerequisite = node.prerequisites[i];
                if (string.IsNullOrEmpty(prerequisite))
                {
                    continue;
                }

                if (!profile.unlockedUpgradeIds.Contains(prerequisite))
                {
                    return false;
                }
            }

            return true;
        }

        private static UpgradeNode CreateUpgrade(string id, string name, string description, int cost, StatModifier modifier, string[] prerequisites)
        {
            UpgradeNode node = ScriptableObject.CreateInstance<UpgradeNode>();
            node.upgradeId = id;
            node.displayName = name;
            node.description = description;
            node.cost = cost;
            node.modifier = modifier;
            node.prerequisites = prerequisites;
            node.oneTimeOnly = true;
            return node;
        }

        private static StatModifier BuildModifier(
            float addMaxHealth,
            float addDamage,
            float addFireRate,
            float addMoveSpeed,
            float addArmor,
            float addProjectileSpeed,
            float addProjectileRange,
            int addProjectilePierce,
            float addSplashRadius,
            float addSlowMultiplier,
            float addSlowDuration,
            float addShieldCapacity,
            float addShieldRegenPerSecond,
            float addTurnSpeed,
            TankFeature addFeatures)
        {
            StatModifier modifier = new StatModifier();
            modifier.addMaxHealth = addMaxHealth;
            modifier.addDamage = addDamage;
            modifier.addFireRate = addFireRate;
            modifier.addMoveSpeed = addMoveSpeed;
            modifier.addArmor = addArmor;
            modifier.addProjectileSpeed = addProjectileSpeed;
            modifier.addProjectileRange = addProjectileRange;
            modifier.addProjectilePierce = addProjectilePierce;
            modifier.addSplashRadius = addSplashRadius;
            modifier.addSlowMultiplier = addSlowMultiplier;
            modifier.addSlowDuration = addSlowDuration;
            modifier.addShieldCapacity = addShieldCapacity;
            modifier.addShieldRegenPerSecond = addShieldRegenPerSecond;
            modifier.addTurnSpeed = addTurnSpeed;
            modifier.addFeatures = addFeatures;
            return modifier;
        }

        private static EnemyArchetype PickArchetype(int stageIndex, int waveIndex, bool bossStage)
        {
            if (bossStage && waveIndex == 0)
            {
                return EnemyArchetype.Boss;
            }

            int pattern = (stageIndex + waveIndex) % 3;
            if (pattern == 0)
            {
                return EnemyArchetype.Grunt;
            }

            if (pattern == 1)
            {
                return EnemyArchetype.Striker;
            }

            return EnemyArchetype.Sniper;
        }
    }
}

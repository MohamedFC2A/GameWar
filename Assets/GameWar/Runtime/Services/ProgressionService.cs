using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    public class ProgressionService
    {
        private readonly Dictionary<string, UpgradeNode> upgradeById = new Dictionary<string, UpgradeNode>();
        private readonly List<UpgradeNode> upgradePool = new List<UpgradeNode>();
        private readonly Dictionary<int, StageDefinition> stageByIndex = new Dictionary<int, StageDefinition>();
        private SaveProfile profile;
        private TankDefinition tankDefinition;

        public SaveProfile Profile
        {
            get { return profile; }
        }

        public TankStats CurrentStats { get; private set; }

        public void Initialize(TankDefinition definition, IEnumerable<UpgradeNode> upgrades, IEnumerable<StageDefinition> stages, SaveProfile loadedProfile)
        {
            tankDefinition = definition != null ? definition : BuiltInContentFactory.CreateDefaultTankDefinition();
            upgradeById.Clear();
            upgradePool.Clear();
            stageByIndex.Clear();

            if (upgrades != null)
            {
                foreach (UpgradeNode node in upgrades)
                {
                    if (node == null || string.IsNullOrEmpty(node.upgradeId))
                    {
                        continue;
                    }

                    if (!upgradeById.ContainsKey(node.upgradeId))
                    {
                        upgradeById.Add(node.upgradeId, node);
                        upgradePool.Add(node);
                    }
                }
            }

            if (stages != null)
            {
                foreach (StageDefinition stage in stages)
                {
                    if (stage == null || stage.stageIndex < 1)
                    {
                        continue;
                    }

                    if (!stageByIndex.ContainsKey(stage.stageIndex))
                    {
                        stageByIndex.Add(stage.stageIndex, stage);
                    }
                }
            }

            profile = loadedProfile != null ? loadedProfile : new SaveProfile();
            if (profile.currentStageIndex < 1)
            {
                profile.currentStageIndex = 1;
            }

            if (profile.highestStageIndex < profile.currentStageIndex)
            {
                profile.highestStageIndex = profile.currentStageIndex;
            }

            if (profile.unlockedUpgradeIds == null)
            {
                profile.unlockedUpgradeIds = new List<string>();
            }

            if (profile.clearedStageIds == null)
            {
                profile.clearedStageIds = new List<string>();
            }

            RebuildStats();
        }

        public void RebuildStats()
        {
            CurrentStats = tankDefinition != null ? tankDefinition.baseStats : TankStats.CreatePlayerDefault();

            if (profile == null || profile.unlockedUpgradeIds == null)
            {
                return;
            }

            for (int i = 0; i < profile.unlockedUpgradeIds.Count; i++)
            {
                string upgradeId = profile.unlockedUpgradeIds[i];
                UpgradeNode node;
                if (!upgradeById.TryGetValue(upgradeId, out node))
                {
                    continue;
                }

                node.modifier.ApplyTo(ref CurrentStats);
            }
        }

        public int Currency
        {
            get { return profile != null ? profile.currency : 0; }
        }

        public bool TryPurchaseUpgrade(UpgradeNode node, out string reason)
        {
            reason = string.Empty;
            if (profile == null)
            {
                reason = "Profile not initialized.";
                return false;
            }

            if (node == null)
            {
                reason = "No upgrade selected.";
                return false;
            }

            if (!upgradeById.ContainsKey(node.upgradeId))
            {
                reason = "Upgrade is not available.";
                return false;
            }

            if (profile.currency < node.cost)
            {
                reason = "Not enough currency.";
                return false;
            }

            if (!BuiltInContentFactory.ArePrerequisitesMet(profile, node))
            {
                reason = "Prerequisites are not met.";
                return false;
            }

            if (node.oneTimeOnly && profile.unlockedUpgradeIds.Contains(node.upgradeId))
            {
                reason = "Upgrade already owned.";
                return false;
            }

            profile.currency -= node.cost;
            if (!profile.unlockedUpgradeIds.Contains(node.upgradeId))
            {
                profile.unlockedUpgradeIds.Add(node.upgradeId);
            }

            RebuildStats();
            return true;
        }

        public void AddCurrency(int amount)
        {
            if (profile == null)
            {
                return;
            }

            profile.currency += Mathf.Max(0, amount);
        }

        public void CompleteStage(StageDefinition stage)
        {
            if (profile == null || stage == null)
            {
                return;
            }

            AddCurrency(stage.rewardCurrency);
            profile.currentStageIndex = Mathf.Max(profile.currentStageIndex, stage.stageIndex + 1);
            profile.highestStageIndex = Mathf.Max(profile.highestStageIndex, stage.stageIndex);
            if (!string.IsNullOrEmpty(stage.stageId) && !profile.clearedStageIds.Contains(stage.stageId))
            {
                profile.clearedStageIds.Add(stage.stageId);
            }
        }

        public void MarkFailedStage()
        {
            if (profile == null)
            {
                return;
            }

            if (profile.currentStageIndex < 1)
            {
                profile.currentStageIndex = 1;
            }
        }

        public StageDefinition GetStageDefinition(int stageIndex)
        {
            int safeIndex = Mathf.Max(1, stageIndex);
            StageDefinition stage;
            if (stageByIndex.TryGetValue(safeIndex, out stage) && stage != null)
            {
                return stage;
            }

            return BuiltInContentFactory.CreateStage(safeIndex);
        }

        public List<UpgradeNode> GetUpgradeOptions(int count)
        {
            List<UpgradeNode> options = new List<UpgradeNode>();
            List<UpgradeNode> available = new List<UpgradeNode>();

            for (int i = 0; i < upgradePool.Count; i++)
            {
                UpgradeNode node = upgradePool[i];
                if (node == null)
                {
                    continue;
                }

                if (node.oneTimeOnly && profile != null && profile.unlockedUpgradeIds.Contains(node.upgradeId))
                {
                    continue;
                }

                if (!BuiltInContentFactory.ArePrerequisitesMet(profile, node))
                {
                    continue;
                }

                if (profile != null && profile.currency < node.cost)
                {
                    continue;
                }

                available.Add(node);
            }

            while (options.Count < count && available.Count > 0)
            {
                int index = Random.Range(0, available.Count);
                options.Add(available[index]);
                available.RemoveAt(index);
            }

            return options;
        }
    }
}

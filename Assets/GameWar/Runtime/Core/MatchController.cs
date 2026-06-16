using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    public class MatchController : MonoBehaviour
    {
        private readonly List<UpgradeNode> upgradeOptions = new List<UpgradeNode>();
        private ProgressionService progression;
        private TankRuntimeBinder player;
        private EnemySpawner enemySpawner;
        private TankDefinition tankDefinition;
        private SaveProfile saveProfile;
        private MatchState state = MatchState.Loading;
        private StageDefinition currentStage;

        public MatchState State
        {
            get { return state; }
        }

        public SaveProfile Profile
        {
            get { return saveProfile; }
        }

        public TankStats CurrentPlayerStats
        {
            get { return progression != null ? progression.CurrentStats : TankStats.CreatePlayerDefault(); }
        }

        public StageDefinition CurrentStage
        {
            get { return currentStage; }
        }

        public List<UpgradeNode> UpgradeOptions
        {
            get { return upgradeOptions; }
        }

        public int Currency
        {
            get { return progression != null ? progression.Currency : 0; }
        }

        public int AliveEnemies
        {
            get { return enemySpawner != null ? enemySpawner.AliveEnemies : 0; }
        }

        public float CurrentHealth
        {
            get { return player != null && player.Health != null ? player.Health.CurrentHealth : 0f; }
        }

        public float MaxHealth
        {
            get { return player != null && player.Health != null ? player.Health.MaxHealth : 0f; }
        }

        public void Configure(TankRuntimeBinder playerBinder, EnemySpawner spawner, TankDefinition tank, List<UpgradeNode> upgrades, List<StageDefinition> stages, SaveProfile loadedProfile)
        {
            player = playerBinder;
            enemySpawner = spawner;
            tankDefinition = tank != null ? tank : BuiltInContentFactory.CreateDefaultTankDefinition();
            saveProfile = loadedProfile != null ? loadedProfile : SaveSystem.LoadOrCreate();

            progression = new ProgressionService();
            progression.Initialize(tankDefinition, upgrades, stages, saveProfile);

            if (player != null)
            {
                player.ApplyStats(progression.CurrentStats);
                if (player.Health != null)
                {
                    player.Health.Died += HandlePlayerDied;
                }
            }

            if (enemySpawner != null)
            {
                enemySpawner.StageCompleted += HandleStageCompleted;
            }

            state = MatchState.Loading;
        }

        private void Start()
        {
            if (progression == null)
            {
                Configure(null, null, null, BuiltInContentFactory.CreateDefaultUpgrades(), BuiltInContentFactory.CreateDefaultStages(), SaveSystem.LoadOrCreate());
            }
        }

        public void StartCampaign()
        {
            if (progression == null || player == null || enemySpawner == null)
            {
                return;
            }

            BeginStage(progression.Profile != null ? progression.Profile.currentStageIndex : 1);
        }

        public void BeginStage(int stageIndex)
        {
            if (progression == null || enemySpawner == null || player == null)
            {
                return;
            }

            currentStage = progression.GetStageDefinition(stageIndex);
            upgradeOptions.Clear();
            state = MatchState.Playing;

            if (player.Health != null)
            {
                player.Health.Configure(progression.CurrentStats);
            }

            player.ApplyStats(progression.CurrentStats);
            player.transform.position = new Vector3(0f, 0.5f, 0f);
            player.transform.rotation = Quaternion.identity;
            enemySpawner.StartStage(currentStage, player.transform);
        }

        private void HandleStageCompleted(StageDefinition stage)
        {
            if (progression == null || stage == null)
            {
                return;
            }

            progression.CompleteStage(stage);
            upgradeOptions.Clear();
            upgradeOptions.AddRange(progression.GetUpgradeOptions(3));
            progression.RebuildStats();
            player.ApplyStats(progression.CurrentStats);
            SaveSystem.Save(saveProfile);
            state = MatchState.Upgrade;
        }

        private void HandlePlayerDied(Health health)
        {
            if (health == null)
            {
                return;
            }

            state = MatchState.Defeat;
            if (enemySpawner != null)
            {
                enemySpawner.StopStage();
            }

            SaveSystem.Save(saveProfile);
        }

        public bool TryPurchaseUpgrade(UpgradeNode node, out string reason)
        {
            reason = string.Empty;
            if (progression == null)
            {
                reason = "Progression is unavailable.";
                return false;
            }

            if (state != MatchState.Upgrade)
            {
                reason = "Upgrades are only available between stages.";
                return false;
            }

            if (!progression.TryPurchaseUpgrade(node, out reason))
            {
                return false;
            }

            upgradeOptions.Remove(node);
            player.ApplyStats(progression.CurrentStats);
            SaveSystem.Save(saveProfile);
            return true;
        }

        public void AdvanceToNextStage()
        {
            if (progression == null)
            {
                return;
            }

            int nextStageIndex = progression.Profile != null ? progression.Profile.currentStageIndex : 1;
            BeginStage(nextStageIndex);
        }

        public void RetryStage()
        {
            if (progression == null)
            {
                return;
            }

            BeginStage(progression.Profile != null ? Mathf.Max(1, progression.Profile.currentStageIndex) : 1);
        }

        public void ResetCampaign()
        {
            if (saveProfile != null)
            {
                saveProfile.currentStageIndex = 1;
                saveProfile.highestStageIndex = 1;
                saveProfile.currency = 0;
                saveProfile.unlockedUpgradeIds.Clear();
                saveProfile.clearedStageIds.Clear();
            }

            progression.Initialize(tankDefinition, BuiltInContentFactory.CreateDefaultUpgrades(), BuiltInContentFactory.CreateDefaultStages(), saveProfile);
            SaveSystem.Save(saveProfile);
            BeginStage(1);
        }
    }
}

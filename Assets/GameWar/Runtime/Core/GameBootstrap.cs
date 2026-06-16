using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    [DefaultExecutionOrder(-1000)]
    public class GameBootstrap : MonoBehaviour
    {
        [SerializeField]
        private float arenaHalfSize = 14f;

        [SerializeField]
        private bool autoStartCampaign = true;

        private bool initialized;
        private MatchController matchController;
        private EnemySpawner enemySpawner;
        private PlayerInputRouter inputRouter;
        private TankRuntimeBinder playerTank;
        private GameOverlay overlay;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateIfMissing()
        {
            if (FindObjectOfType<GameBootstrap>() != null)
            {
                return;
            }

            GameObject bootstrapObject = new GameObject("GameBootstrap");
            bootstrapObject.AddComponent<GameBootstrap>();
        }

        private void Awake()
        {
            if (initialized)
            {
                return;
            }

            initialized = true;
            DontDestroyOnLoad(gameObject);
            BuildRuntimeWorld();
        }

        private void Start()
        {
            if (autoStartCampaign && matchController != null)
            {
                matchController.StartCampaign();
            }
        }

        private void BuildRuntimeWorld()
        {
            CombatRegistry.EnsureExists();

            if (FindObjectOfType<Camera>() == null)
            {
                RuntimeFactory.CreateTopDownCamera();
            }

            if (FindObjectOfType<Light>() == null)
            {
                RuntimeFactory.CreateDirectionalLight();
            }

            if (FindObjectOfType<ArenaBounds>() == null)
            {
                GameObject arenaObject = new GameObject("ArenaBounds");
                ArenaBounds bounds = arenaObject.AddComponent<ArenaBounds>();
                bounds.HalfExtents = new Vector2(arenaHalfSize, arenaHalfSize);
                DontDestroyOnLoad(arenaObject);
                RuntimeFactory.CreateArenaVisuals(arenaHalfSize);
            }

            inputRouter = FindObjectOfType<PlayerInputRouter>();
            if (inputRouter == null)
            {
                GameObject inputObject = new GameObject("PlayerInputRouter");
                inputRouter = inputObject.AddComponent<PlayerInputRouter>();
                DontDestroyOnLoad(inputObject);
            }

            matchController = FindObjectOfType<MatchController>();
            if (matchController == null)
            {
                GameObject matchObject = new GameObject("MatchController");
                matchController = matchObject.AddComponent<MatchController>();
                DontDestroyOnLoad(matchObject);
            }

            enemySpawner = FindObjectOfType<EnemySpawner>();
            if (enemySpawner == null)
            {
                GameObject spawnerObject = new GameObject("EnemySpawner");
                enemySpawner = spawnerObject.AddComponent<EnemySpawner>();
                DontDestroyOnLoad(spawnerObject);
            }

            overlay = FindObjectOfType<GameOverlay>();
            if (overlay == null)
            {
                GameObject overlayObject = new GameObject("GameOverlay");
                overlay = overlayObject.AddComponent<GameOverlay>();
                DontDestroyOnLoad(overlayObject);
            }

            TankDefinition tankDefinition = BuiltInContentFactory.CreateDefaultTankDefinition();
            List<UpgradeNode> upgrades = BuiltInContentFactory.CreateDefaultUpgrades();
            List<StageDefinition> stages = BuiltInContentFactory.CreateDefaultStages();
            SaveProfile profile = SaveSystem.LoadOrCreate();

            if (playerTank == null)
            {
                playerTank = RuntimeFactory.CreateTankFromDefinition(tankDefinition, Vector3.zero, TeamKind.Player);
                playerTank.name = "PlayerTank";
                PlayerTankAgent agent = playerTank.gameObject.AddComponent<PlayerTankAgent>();
                agent.Initialize(playerTank, inputRouter);
            }

            matchController.Configure(playerTank, enemySpawner, tankDefinition, upgrades, stages, profile);
            overlay.Bind(matchController);
        }
    }
}

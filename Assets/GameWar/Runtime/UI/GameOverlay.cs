using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    public class GameOverlay : MonoBehaviour
    {
        private MatchController matchController;
        private GUIStyle titleStyle;
        private GUIStyle bodyStyle;
        private GUIStyle buttonStyle;
        private Rect layoutRect;

        public void Bind(MatchController controller)
        {
            matchController = controller;
        }

        private void Awake()
        {
            BuildStyles();
        }

        private void BuildStyles()
        {
            titleStyle = new GUIStyle(GUI.skin.label);
            titleStyle.fontSize = 28;
            titleStyle.fontStyle = FontStyle.Bold;
            titleStyle.normal.textColor = Color.white;

            bodyStyle = new GUIStyle(GUI.skin.label);
            bodyStyle.fontSize = 18;
            bodyStyle.wordWrap = true;
            bodyStyle.normal.textColor = new Color(0.9f, 0.92f, 0.96f, 1f);

            buttonStyle = new GUIStyle(GUI.skin.button);
            buttonStyle.fontSize = 18;
            buttonStyle.fixedHeight = 52f;
            buttonStyle.wordWrap = true;
        }

        private void OnGUI()
        {
            if (matchController == null)
            {
                matchController = FindObjectOfType<MatchController>();
            }

            if (matchController == null)
            {
                return;
            }

            float width = Mathf.Min(Screen.width - 30f, 420f);
            layoutRect = new Rect(15f, 15f, width, Screen.height - 30f);

            GUI.Box(layoutRect, GUIContent.none);
            GUILayout.BeginArea(layoutRect);
            GUILayout.Space(10f);

            GUILayout.Label("Tank Arena", titleStyle);
            GUILayout.Label("Offline campaign. Move with left drag or WASD. Fire on the right side or Space.", bodyStyle);
            GUILayout.Space(10f);

            GUILayout.Label("State: " + matchController.State, bodyStyle);
            GUILayout.Label("Stage: " + DescribeStage(), bodyStyle);
            GUILayout.Label("Currency: " + matchController.Currency, bodyStyle);
            GUILayout.Label("Enemies alive: " + matchController.AliveEnemies, bodyStyle);

            TankStats stats = matchController.CurrentPlayerStats;
            GUILayout.Space(6f);
            GUILayout.Label("HP " + matchController.CurrentHealth.ToString("0") + "/" + matchController.MaxHealth.ToString("0") + " | DMG " + stats.damage.ToString("0") + " | ROF " + stats.fireRate.ToString("0.0") + " | SPD " + stats.moveSpeed.ToString("0.0"), bodyStyle);
            GUILayout.Label("ARM " + stats.armor.ToString("0.0") + " | PIERCE " + stats.projectilePierce + " | SPLASH " + stats.splashRadius.ToString("0.0"), bodyStyle);

            GUILayout.Space(12f);

            switch (matchController.State)
            {
                case MatchState.Playing:
                    GUILayout.Label("Fight until the stage is clear.", bodyStyle);
                    break;

                case MatchState.Upgrade:
                    DrawUpgradePanel();
                    break;

                case MatchState.Defeat:
                    GUILayout.Label("Defeat. Retry the current stage or reset the campaign.", bodyStyle);
                    if (GUILayout.Button("Retry Stage", buttonStyle))
                    {
                        matchController.RetryStage();
                    }

                    if (GUILayout.Button("Reset Campaign", buttonStyle))
                    {
                        matchController.ResetCampaign();
                    }
                    break;

                case MatchState.Loading:
                    GUILayout.Label("Loading...", bodyStyle);
                    break;
            }

            GUILayout.EndArea();
        }

        private void DrawUpgradePanel()
        {
            GUILayout.Label("Choose one upgrade or skip to the next stage.", bodyStyle);

            List<UpgradeNode> upgrades = matchController.UpgradeOptions;
            if (upgrades != null)
            {
                for (int i = 0; i < upgrades.Count; i++)
                {
                    UpgradeNode node = upgrades[i];
                    if (node == null)
                    {
                        continue;
                    }

                    string label = node.displayName + " (" + node.cost + ")";
                    if (GUILayout.Button(label + "\n" + node.description, buttonStyle))
                    {
                        string reason;
                        if (!matchController.TryPurchaseUpgrade(node, out reason))
                        {
                            Debug.LogWarning(reason);
                        }
                    }
                    GUILayout.Space(4f);
                }
            }

            GUILayout.Space(8f);
            if (GUILayout.Button("Continue to Next Stage", buttonStyle))
            {
                matchController.AdvanceToNextStage();
            }
        }

        private string DescribeStage()
        {
            if (matchController.CurrentStage == null)
            {
                return "Not started";
            }

            return matchController.CurrentStage.displayName + " (" + matchController.CurrentStage.stageId + ")";
        }
    }
}

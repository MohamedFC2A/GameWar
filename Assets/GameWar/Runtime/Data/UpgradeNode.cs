using UnityEngine;

namespace GameWar
{
    [CreateAssetMenu(menuName = "GameWar/Upgrade Node", fileName = "UpgradeNode")]
    public class UpgradeNode : ScriptableObject
    {
        public string upgradeId = "upgrade_id";
        public string displayName = "Upgrade";
        [TextArea(2, 4)]
        public string description;
        public int cost = 50;
        public string[] prerequisites;
        public bool oneTimeOnly = true;
        public StatModifier modifier;
    }
}

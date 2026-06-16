using UnityEngine;

namespace GameWar
{
    [CreateAssetMenu(menuName = "GameWar/Tank Definition", fileName = "TankDefinition")]
    public class TankDefinition : ScriptableObject
    {
        public string tankId = "starter_tank";
        public string displayName = "Starter Tank";
        public Color bodyColor = new Color(0.19f, 0.62f, 0.92f, 1f);
        public TankStats baseStats = TankStats.CreatePlayerDefault();
    }
}

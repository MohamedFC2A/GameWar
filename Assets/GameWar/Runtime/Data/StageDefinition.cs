using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    [CreateAssetMenu(menuName = "GameWar/Stage Definition", fileName = "StageDefinition")]
    public class StageDefinition : ScriptableObject
    {
        public string stageId = "stage_01";
        public int stageIndex = 1;
        public string displayName = "Operation 1";
        public int rewardCurrency = 40;
        public bool bossStage;
        public List<EnemyWaveDefinition> waves = new List<EnemyWaveDefinition>();
    }
}

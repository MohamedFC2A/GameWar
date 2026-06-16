using UnityEngine;

namespace GameWar
{
    public class CombatTeam : MonoBehaviour
    {
        [SerializeField]
        private TeamKind team = TeamKind.Player;

        public TeamKind Team
        {
            get { return team; }
            set { team = value; }
        }
    }
}

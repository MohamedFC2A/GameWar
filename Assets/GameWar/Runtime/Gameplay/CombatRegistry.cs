using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    public class CombatRegistry : MonoBehaviour
    {
        private static CombatRegistry instance;
        private readonly List<TankRuntimeBinder> units = new List<TankRuntimeBinder>();

        public static CombatRegistry Instance
        {
            get { return instance; }
        }

        public static CombatRegistry EnsureExists()
        {
            if (instance != null)
            {
                return instance;
            }

            GameObject root = new GameObject("CombatRegistry");
            instance = root.AddComponent<CombatRegistry>();
            DontDestroyOnLoad(root);
            return instance;
        }

        private void Awake()
        {
            if (instance != null && instance != this)
            {
                Destroy(gameObject);
                return;
            }

            instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public void Register(TankRuntimeBinder unit)
        {
            if (unit == null || units.Contains(unit))
            {
                return;
            }

            units.Add(unit);
        }

        public void Unregister(TankRuntimeBinder unit)
        {
            if (unit == null)
            {
                return;
            }

            units.Remove(unit);
        }

        public TankRuntimeBinder FindNearestEnemy(Vector3 position, TeamKind team)
        {
            TankRuntimeBinder closest = null;
            float closestDistance = float.MaxValue;
            for (int i = 0; i < units.Count; i++)
            {
                TankRuntimeBinder unit = units[i];
                if (unit == null || !unit.isActiveAndEnabled)
                {
                    continue;
                }

                if (unit.Team == team)
                {
                    continue;
                }

                float distance = Vector3.SqrMagnitude(unit.transform.position - position);
                if (distance < closestDistance)
                {
                    closestDistance = distance;
                    closest = unit;
                }
            }

            return closest;
        }

        public TankRuntimeBinder FindTeamMember(TeamKind team)
        {
            for (int i = 0; i < units.Count; i++)
            {
                TankRuntimeBinder unit = units[i];
                if (unit != null && unit.isActiveAndEnabled && unit.Team == team)
                {
                    return unit;
                }
            }

            return null;
        }

        public int CountAlive(TeamKind team)
        {
            int count = 0;
            for (int i = 0; i < units.Count; i++)
            {
                TankRuntimeBinder unit = units[i];
                if (unit != null && unit.isActiveAndEnabled && unit.Team == team)
                {
                    count++;
                }
            }

            return count;
        }
    }
}

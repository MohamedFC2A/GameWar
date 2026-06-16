using UnityEngine;

namespace GameWar
{
    public class EnemyTankAI : MonoBehaviour
    {
        [SerializeField]
        private TankRuntimeBinder binder;

        private Transform target;
        private EnemyArchetype archetype;
        private float preferredRange = 7f;
        private float strafeStrength = 0.35f;

        private void Awake()
        {
            if (binder == null)
            {
                binder = GetComponent<TankRuntimeBinder>();
            }
        }

        public void Initialize(Transform targetTransform, EnemyArchetype enemyArchetype, TankStats stats)
        {
            target = targetTransform;
            archetype = enemyArchetype;
            preferredRange = archetype == EnemyArchetype.Sniper ? 11f : archetype == EnemyArchetype.Boss ? 8f : 6f;
            strafeStrength = archetype == EnemyArchetype.Sniper ? 0.2f : archetype == EnemyArchetype.Boss ? 0.28f : 0.4f;

            if (binder != null)
            {
                binder.ApplyStats(stats);
            }
        }

        private void Update()
        {
            if (binder == null)
            {
                return;
            }

            if (target == null && CombatRegistry.Instance != null)
            {
                TankRuntimeBinder player = CombatRegistry.Instance.FindTeamMember(TeamKind.Player);
                if (player != null)
                {
                    target = player.transform;
                }
            }

            if (target == null)
            {
                binder.SetMoveInput(Vector2.zero);
                binder.SetFire(false);
                binder.TickWeapon();
                return;
            }

            Vector3 toTarget = target.position - transform.position;
            toTarget.y = 0f;
            float distance = toTarget.magnitude;
            Vector3 forward = toTarget.sqrMagnitude > 0.01f ? toTarget.normalized : transform.forward;

            Vector2 move = Vector2.zero;
            if (distance > preferredRange + 1.5f)
            {
                move = new Vector2(forward.x, forward.z);
            }
            else if (distance < preferredRange * 0.7f)
            {
                move = new Vector2(-forward.x, -forward.z);
            }

            Vector3 side = Vector3.Cross(Vector3.up, forward);
            move += new Vector2(side.x, side.z) * strafeStrength;

            binder.SetMoveInput(move);
            binder.SetFacing(forward);
            binder.SetFire(distance <= preferredRange + 2.5f);
            binder.TickWeapon();
        }
    }
}

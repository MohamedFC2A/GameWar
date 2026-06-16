using UnityEngine;

namespace GameWar
{
    [RequireComponent(typeof(TankMotor))]
    [RequireComponent(typeof(TankWeapon))]
    [RequireComponent(typeof(Health))]
    [RequireComponent(typeof(CombatTeam))]
    public class TankRuntimeBinder : MonoBehaviour
    {
        private TankMotor motor;
        private TankWeapon weapon;
        private Health health;
        private CombatTeam combatTeam;
        private TankStats currentStats;

        public TeamKind Team
        {
            get { return combatTeam != null ? combatTeam.Team : TeamKind.Player; }
        }

        public TankStats CurrentStats
        {
            get { return currentStats; }
        }

        private void Awake()
        {
            motor = GetComponent<TankMotor>();
            weapon = GetComponent<TankWeapon>();
            health = GetComponent<Health>();
            combatTeam = GetComponent<CombatTeam>();
        }

        private void OnEnable()
        {
            CombatRegistry.EnsureExists().Register(this);
        }

        private void OnDisable()
        {
            if (CombatRegistry.Instance != null)
            {
                CombatRegistry.Instance.Unregister(this);
            }
        }

        public void ApplyStats(TankStats stats)
        {
            currentStats = stats;
            if (motor != null)
            {
                motor.Configure(stats);
            }

            if (weapon != null)
            {
                weapon.Configure(stats, combatTeam);
            }

            if (health != null)
            {
                health.Configure(stats);
            }
        }

        public void SetMoveInput(Vector2 input)
        {
            if (motor != null)
            {
                motor.SetMoveInput(input);
            }
        }

        public void SetFacing(Vector3 direction)
        {
            if (motor != null)
            {
                motor.SetFacing(direction);
            }
        }

        public void SetFire(bool shouldFire)
        {
            if (weapon != null)
            {
                weapon.SetFiring(shouldFire);
            }
        }

        public void TickWeapon()
        {
            if (weapon != null)
            {
                weapon.Tick();
            }
        }

        public Health Health
        {
            get { return health; }
        }
    }
}

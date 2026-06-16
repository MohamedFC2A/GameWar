using UnityEngine;

namespace GameWar
{
    public class TankWeapon : MonoBehaviour
    {
        [SerializeField]
        private Transform muzzle;

        [SerializeField]
        private Color projectileColor = Color.yellow;

        private TankStats stats;
        private CombatTeam combatTeam;
        private bool firing;
        private float nextFireTime;

        private void Awake()
        {
            if (muzzle == null)
            {
                Transform found = transform.Find("VisualRoot/Muzzle");
                if (found != null)
                {
                    muzzle = found;
                }
            }
        }

        public void Configure(TankStats sourceStats, CombatTeam team)
        {
            stats = sourceStats;
            combatTeam = team;
            firing = false;
            nextFireTime = 0f;
        }

        public void SetProjectileColor(Color color)
        {
            projectileColor = color;
        }

        public void SetFiring(bool shouldFire)
        {
            firing = shouldFire;
        }

        public void Tick()
        {
            if (!firing)
            {
                return;
            }

            if (Time.time < nextFireTime)
            {
                return;
            }

            nextFireTime = Time.time + stats.FireCooldown;
            Fire();
        }

        public void Fire()
        {
            Vector3 origin = muzzle != null ? muzzle.position : transform.position + transform.forward * 1.1f + Vector3.up * 0.4f;
            Projectile projectile = Projectile.CreateRuntimeProjectile(origin, projectileColor);
            projectile.Launch(stats, combatTeam != null ? combatTeam.Team : TeamKind.Player, transform.forward);
        }
    }
}

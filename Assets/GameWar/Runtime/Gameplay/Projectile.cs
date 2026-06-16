using UnityEngine;

namespace GameWar
{
    [RequireComponent(typeof(SphereCollider))]
    public class Projectile : MonoBehaviour
    {
        private TankStats stats;
        private TeamKind ownerTeam;
        private Vector3 direction;
        private float speed;
        private float range;
        private float traveled;
        private int pierceRemaining;
        private bool activeProjectile;
        private SphereCollider sphereCollider;

        private void Awake()
        {
            sphereCollider = GetComponent<SphereCollider>();
            sphereCollider.isTrigger = true;
        }

        public static Projectile CreateRuntimeProjectile(Vector3 position, Color color)
        {
            GameObject root = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            root.name = "Projectile";
            root.transform.position = position;
            root.transform.localScale = Vector3.one * 0.35f;

            Rigidbody rigidbody = root.AddComponent<Rigidbody>();
            rigidbody.isKinematic = true;
            rigidbody.useGravity = false;

            Collider collider = root.GetComponent<Collider>();
            if (collider != null)
            {
                collider.isTrigger = true;
            }

            Renderer renderer = root.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material = RuntimeFactory.CreateColoredMaterial(color);
            }

            Projectile projectile = root.AddComponent<Projectile>();
            return projectile;
        }

        public void Launch(TankStats sourceStats, TeamKind team, Vector3 fireDirection)
        {
            stats = sourceStats;
            ownerTeam = team;
            direction = fireDirection.sqrMagnitude > 0.001f ? fireDirection.normalized : transform.forward;
            speed = Mathf.Max(4f, sourceStats.projectileSpeed);
            range = Mathf.Max(3f, sourceStats.projectileRange);
            traveled = 0f;
            pierceRemaining = Mathf.Max(0, sourceStats.projectilePierce);
            activeProjectile = true;
            gameObject.SetActive(true);
            transform.forward = direction;
        }

        private void Update()
        {
            if (!activeProjectile)
            {
                return;
            }

            float step = speed * Time.deltaTime;
            transform.position += direction * step;
            traveled += step;

            if (traveled >= range)
            {
                Despawn();
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!activeProjectile || other == null)
            {
                return;
            }

            CombatTeam team = other.GetComponentInParent<CombatTeam>();
            if (team != null && team.Team == ownerTeam)
            {
                return;
            }

            Health health = other.GetComponentInParent<Health>();
            if (health != null)
            {
                health.TakeDamage(stats.damage);

                TankMotor motor = other.GetComponentInParent<TankMotor>();
                if (motor != null && stats.features.HasFlag(TankFeature.SlowingShells))
                {
                    motor.ApplySlow(stats.slowMultiplier, stats.slowDuration);
                }
            }

            if (stats.features.HasFlag(TankFeature.ExplosiveShells) && stats.splashRadius > 0f)
            {
                Explode();
            }

            if (pierceRemaining > 0)
            {
                pierceRemaining--;
                return;
            }

            Despawn();
        }

        private void Explode()
        {
            Collider[] hits = Physics.OverlapSphere(transform.position, stats.splashRadius);
            for (int i = 0; i < hits.Length; i++)
            {
                Collider hit = hits[i];
                if (hit == null)
                {
                    continue;
                }

                CombatTeam team = hit.GetComponentInParent<CombatTeam>();
                if (team != null && team.Team == ownerTeam)
                {
                    continue;
                }

                Health health = hit.GetComponentInParent<Health>();
                if (health != null)
                {
                    health.TakeDamage(stats.damage * 0.65f);
                }
            }
        }

        private void Despawn()
        {
            activeProjectile = false;
            Destroy(gameObject);
        }
    }
}

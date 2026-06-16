using UnityEngine;

namespace GameWar
{
    [RequireComponent(typeof(Rigidbody))]
    public class TankMotor : MonoBehaviour
    {
        private Rigidbody body;
        private TankStats stats;
        private Vector2 moveInput;
        private Vector3 facingDirection = Vector3.forward;
        private float slowMultiplier = 1f;
        private float slowTimer;

        private void Awake()
        {
            body = GetComponent<Rigidbody>();
            body.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
            body.interpolation = RigidbodyInterpolation.Interpolate;
        }

        public void Configure(TankStats newStats)
        {
            stats = newStats;
            slowMultiplier = 1f;
            slowTimer = 0f;
            if (body != null)
            {
                body.velocity = Vector3.zero;
                body.angularVelocity = Vector3.zero;
            }
        }

        public void SetMoveInput(Vector2 input)
        {
            moveInput = Vector2.ClampMagnitude(input, 1f);
        }

        public void SetFacing(Vector3 direction)
        {
            if (direction.sqrMagnitude > 0.001f)
            {
                facingDirection = direction.normalized;
            }
        }

        public void ApplySlow(float multiplier, float duration)
        {
            slowMultiplier = Mathf.Min(slowMultiplier, Mathf.Clamp(multiplier, 0.15f, 1f));
            slowTimer = Mathf.Max(slowTimer, duration);
        }

        private void Update()
        {
            if (slowTimer > 0f)
            {
                slowTimer -= Time.deltaTime;
                if (slowTimer <= 0f)
                {
                    slowMultiplier = 1f;
                }
            }
        }

        private void FixedUpdate()
        {
            Vector3 velocity = new Vector3(moveInput.x, 0f, moveInput.y) * stats.moveSpeed * slowMultiplier;
            body.velocity = new Vector3(velocity.x, body.velocity.y, velocity.z);

            if (facingDirection.sqrMagnitude > 0.001f)
            {
                Quaternion targetRotation = Quaternion.LookRotation(facingDirection, Vector3.up);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, stats.turnSpeed * Time.fixedDeltaTime);
            }

            if (ArenaBounds.Instance != null)
            {
                body.position = ArenaBounds.Instance.Clamp(body.position);
            }
        }
    }
}

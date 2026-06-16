using UnityEngine;

namespace GameWar
{
    public class PlayerTankAgent : MonoBehaviour
    {
        [SerializeField]
        private TankRuntimeBinder binder;

        [SerializeField]
        private PlayerInputRouter inputRouter;

        private void Awake()
        {
            if (binder == null)
            {
                binder = GetComponent<TankRuntimeBinder>();
            }
        }

        public void Initialize(TankRuntimeBinder runtimeBinder, PlayerInputRouter router)
        {
            binder = runtimeBinder;
            inputRouter = router;
        }

        private void Update()
        {
            if (binder == null)
            {
                binder = GetComponent<TankRuntimeBinder>();
            }

            if (inputRouter == null)
            {
                inputRouter = FindObjectOfType<PlayerInputRouter>();
            }

            if (binder == null || inputRouter == null)
            {
                return;
            }

            Vector2 move = inputRouter.MoveAxis;
            binder.SetMoveInput(move);

            Vector3 facing = Vector3.forward;
            if (move.sqrMagnitude > 0.01f)
            {
                facing = new Vector3(move.x, 0f, move.y);
            }
            else if (CombatRegistry.Instance != null)
            {
                TankRuntimeBinder nearestEnemy = CombatRegistry.Instance.FindNearestEnemy(transform.position, TeamKind.Player);
                if (nearestEnemy != null)
                {
                    Vector3 toEnemy = nearestEnemy.transform.position - transform.position;
                    toEnemy.y = 0f;
                    if (toEnemy.sqrMagnitude > 0.01f)
                    {
                        facing = toEnemy.normalized;
                    }
                }
            }

            binder.SetFacing(facing);
            binder.SetFire(inputRouter.FireHeld);
            binder.TickWeapon();
        }
    }
}

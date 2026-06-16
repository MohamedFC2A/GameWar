using UnityEngine;

namespace GameWar
{
    public class ArenaBounds : MonoBehaviour
    {
        private static ArenaBounds instance;

        [SerializeField]
        private Vector2 halfExtents = new Vector2(14f, 14f);

        public static ArenaBounds Instance
        {
            get { return instance; }
        }

        public Vector2 HalfExtents
        {
            get { return halfExtents; }
            set { halfExtents = value; }
        }

        private void Awake()
        {
            instance = this;
        }

        public Vector3 Clamp(Vector3 position)
        {
            position.x = Mathf.Clamp(position.x, -halfExtents.x, halfExtents.x);
            position.z = Mathf.Clamp(position.z, -halfExtents.y, halfExtents.y);
            return position;
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.cyan;
            Gizmos.DrawWireCube(transform.position, new Vector3(halfExtents.x * 2f, 0.25f, halfExtents.y * 2f));
        }
    }
}

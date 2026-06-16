using UnityEngine;

namespace GameWar
{
    public static class RuntimeFactory
    {
        public static TankRuntimeBinder CreateTank(string name, Vector3 position, TeamKind team, Color bodyColor, TankStats stats)
        {
            GameObject root = new GameObject(name);
            position.y = 0.5f;
            root.transform.position = position;

            Rigidbody body = root.AddComponent<Rigidbody>();
            body.useGravity = false;
            body.drag = 4f;
            body.angularDrag = 999f;
            body.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;

            BoxCollider collider = root.AddComponent<BoxCollider>();
            collider.size = new Vector3(1.4f, 0.8f, 1.8f);

            CombatTeam combatTeam = root.AddComponent<CombatTeam>();
            combatTeam.Team = team;

            TankMotor motor = root.AddComponent<TankMotor>();
            TankWeapon weapon = root.AddComponent<TankWeapon>();
            Health health = root.AddComponent<Health>();
            TankRuntimeBinder binder = root.AddComponent<TankRuntimeBinder>();

            GameObject visualRoot = new GameObject("VisualRoot");
            visualRoot.transform.SetParent(root.transform, false);

            GameObject bodyMesh = GameObject.CreatePrimitive(PrimitiveType.Cube);
            bodyMesh.name = "Body";
            bodyMesh.transform.SetParent(visualRoot.transform, false);
            bodyMesh.transform.localPosition = new Vector3(0f, 0.35f, 0f);
            bodyMesh.transform.localScale = new Vector3(1.4f, 0.45f, 1.9f);
            Collider bodyCollider = bodyMesh.GetComponent<Collider>();
            if (bodyCollider != null)
            {
                Object.Destroy(bodyCollider);
            }
            SetColor(bodyMesh, bodyColor);

            GameObject turret = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            turret.name = "Turret";
            turret.transform.SetParent(visualRoot.transform, false);
            turret.transform.localPosition = new Vector3(0f, 0.65f, 0f);
            turret.transform.localScale = new Vector3(0.75f, 0.18f, 0.75f);
            Collider turretCollider = turret.GetComponent<Collider>();
            if (turretCollider != null)
            {
                Object.Destroy(turretCollider);
            }
            SetColor(turret, Color.Lerp(bodyColor, Color.white, 0.2f));

            GameObject muzzle = new GameObject("Muzzle");
            muzzle.transform.SetParent(visualRoot.transform, false);
            muzzle.transform.localPosition = new Vector3(0f, 0.7f, 1.1f);

            weapon.SetProjectileColor(Color.Lerp(bodyColor, Color.yellow, 0.5f));
            binder.ApplyStats(stats);
            root.transform.rotation = Quaternion.identity;
            return binder;
        }

        public static TankRuntimeBinder CreateTankFromDefinition(TankDefinition definition, Vector3 position, TeamKind team)
        {
            TankDefinition source = definition != null ? definition : BuiltInContentFactory.CreateDefaultTankDefinition();
            return CreateTank(source.displayName, position, team, source.bodyColor, source.baseStats);
        }

        public static Camera CreateTopDownCamera()
        {
            GameObject cameraObject = new GameObject("Main Camera");
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.07f, 0.08f, 0.11f, 1f);
            camera.orthographic = false;
            camera.transform.position = new Vector3(0f, 18f, -10f);
            camera.transform.rotation = Quaternion.Euler(60f, 0f, 0f);
            camera.tag = "MainCamera";
            Object.DontDestroyOnLoad(cameraObject);
            return camera;
        }

        public static Light CreateDirectionalLight()
        {
            GameObject lightObject = new GameObject("Directional Light");
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.15f;
            light.color = new Color(1f, 0.98f, 0.93f, 1f);
            lightObject.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            Object.DontDestroyOnLoad(lightObject);
            return light;
        }

        public static void CreateArenaVisuals(float size)
        {
            GameObject root = new GameObject("ArenaVisuals");
            Object.DontDestroyOnLoad(root);

            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "ArenaFloor";
            floor.transform.position = Vector3.zero;
            floor.transform.localScale = new Vector3(size / 10f, 1f, size / 10f);
            floor.transform.SetParent(root.transform, true);
            SetColor(floor, new Color(0.12f, 0.14f, 0.17f, 1f));

            CreateWall(root.transform, "ArenaWallNorth", new Vector3(0f, 1f, size), new Vector3(size * 2f, 2f, 1f));
            CreateWall(root.transform, "ArenaWallSouth", new Vector3(0f, 1f, -size), new Vector3(size * 2f, 2f, 1f));
            CreateWall(root.transform, "ArenaWallEast", new Vector3(size, 1f, 0f), new Vector3(1f, 2f, size * 2f));
            CreateWall(root.transform, "ArenaWallWest", new Vector3(-size, 1f, 0f), new Vector3(1f, 2f, size * 2f));
        }

        private static void CreateWall(Transform parent, string name, Vector3 position, Vector3 scale)
        {
            GameObject wall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            wall.name = name;
            wall.transform.position = position;
            wall.transform.localScale = scale;
            wall.transform.SetParent(parent, true);
            SetColor(wall, new Color(0.08f, 0.09f, 0.1f, 1f));
        }

        private static void SetColor(GameObject target, Color color)
        {
            Renderer renderer = target.GetComponent<Renderer>();
            if (renderer == null)
            {
                return;
            }

            renderer.material = CreateColoredMaterial(color);
        }

        public static Material CreateColoredMaterial(Color color)
        {
            Shader shader = Shader.Find("Standard");
            if (shader == null)
            {
                shader = Shader.Find("Universal Render Pipeline/Lit");
            }

            if (shader == null)
            {
                shader = Shader.Find("Unlit/Color");
            }

            Material material = new Material(shader);
            material.color = color;
            return material;
        }
    }
}
